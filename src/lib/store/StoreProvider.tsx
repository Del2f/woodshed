import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { LocalStore } from './localStore';
import { SupabaseStore } from './supabaseStore';
import type { DataStore } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// PKCE 흐름은 로그인 결과를 ?code= 로 돌려주므로 HashRouter(#/...)와 충돌하지 않는다.
const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }) : null;

const localStore = new LocalStore();

interface StoreContextValue {
  store: DataStore;
  supabase: SupabaseClient | null;
  session: Session | null;
  /** 인증 상태 확인이 끝났는지 */
  ready: boolean;
  /** 데이터가 바뀌면 올라가는 숫자 — 화면들이 다시 불러오는 신호 */
  version: number;
  bump: () => void;
  localStore: LocalStore;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!supabase) {
      // 로컬 모드: 브라우저가 저장 공간을 임의로 비우지 않도록 요청
      navigator.storage?.persist?.().catch(() => undefined);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setVersion((v) => v + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 같은 사용자라면 store 인스턴스를 유지해야 화면들이 불필요하게 다시 불러오지 않는다
  const userId = session?.user.id ?? null;
  const store = useMemo<DataStore>(() => (userId && supabase ? new SupabaseStore(supabase) : localStore), [userId]);

  const value = useMemo<StoreContextValue>(
    () => ({
      store,
      supabase,
      session,
      ready,
      version,
      bump: () => setVersion((v) => v + 1),
      localStore,
    }),
    [store, session, ready, version],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
