import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/router';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('buyer');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Helper sync profile & role dari database
  const syncUserData = async (authUser) => {
    if (!authUser) {
      setUser(null);
      setRole('buyer');
      return null;
    }

    try {
      // 1. Coba cari profile berdasarkan auth ID
      let { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      // 2. Jika belum ketemu, cari berdasarkan email (migrasi dari Firebase)
      if (!profile && authUser.email) {
        const { data: profileByEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();

        if (profileByEmail) {
          profile = profileByEmail;
          // Hubungkan record ini dengan Supabase auth UUID baru
          await supabase
            .from('users')
            .update({ id: authUser.id, updated_at: new Date().toISOString() })
            .eq('email', authUser.email);
        }
      }

      if (profile) {
        const userRole = profile.role || 'buyer';
        setRole(userRole);
        const fullUser = {
          ...authUser,
          ...profile,
          id: authUser.id,
          uid: authUser.id,
          role: userRole,
        };
        setUser(fullUser);
        return fullUser;
      } else {
        // User baru mendaftar
        const newProfile = {
          id: authUser.id,
          email: authUser.email,
          role: 'buyer',
          profile: {
            name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
            avatar: authUser.user_metadata?.avatar_url || '',
          },
          updated_at: new Date().toISOString(),
        };
        await supabase.from('users').insert(newProfile);
        setRole('buyer');
        const fullUser = {
          ...authUser,
          ...newProfile,
          id: authUser.id,
          uid: authUser.id,
          role: 'buyer',
        };
        setUser(fullUser);
        return fullUser;
      }
    } catch (err) {
      console.error('Error syncing user profile:', err);
      const fallbackUser = {
        ...authUser,
        uid: authUser.id,
        role: 'buyer',
      };
      setUser(fallbackUser);
      setRole('buyer');
      return fallbackUser;
    }
  };

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession?.user) {
        const synced = await syncUserData(currentSession.user);
        // Jika sedang di halaman login dan terdeteksi admin, langsung redirect
        if (router.pathname === '/login' && synced?.role === 'admin') {
          router.replace('/admin/dashboard');
        }
      }
      setLoading(false);
    });

    // Listen for auth state changes (termasuk OAuth redirect hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const synced = await syncUserData(newSession.user);
        if (event === 'SIGNED_IN') {
          if (synced?.role === 'admin' && !router.pathname.startsWith('/admin')) {
            router.replace('/admin/dashboard');
          }
        }
      } else {
        setUser(null);
        setRole('buyer');
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const loginWithGoogle = async () => {
    const siteUrl = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/api/auth/callback`,
      },
    });
    if (error) throw error;
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data?.user) {
      const fullUser = await syncUserData(data.user);
      return { ...data, fullUser };
    }
    return data;
  };

  const signup = async (email, password, extraData = {}) => {
    const siteUrl = window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/api/auth/callback`,
        data: extraData,
      },
    });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole('buyer');
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isAdmin: role === 'admin',
        loading,
        login,
        signup,
        loginWithGoogle,
        logout,
        syncUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
