import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { supabase } from '@/utils/supabase';

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/login');
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(String(code));

    if (sessionError || !sessionData?.user) {
      console.error('Exchange code error:', sessionError);
      return res.redirect('/login?error=oauth');
    }

    const authUser = sessionData.user;
    const email = authUser.email;

    // Ambil role dari tabel users
    let role = 'buyer';
    let { data: profile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (!profile && email) {
      const { data: profileByEmail } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('email', email)
        .maybeSingle();

      if (profileByEmail) {
        role = profileByEmail.role || 'buyer';
        // Sinkronkan UUID
        await supabaseAdmin
          .from('users')
          .update({ id: authUser.id, updated_at: new Date().toISOString() })
          .eq('email', email);
      } else {
        // User baru lewat OAuth
        const newProfile = {
          id: authUser.id,
          email,
          role: 'buyer',
          profile: {
            name: authUser.user_metadata?.full_name || email.split('@')[0],
            avatar: authUser.user_metadata?.avatar_url || '',
          },
          updated_at: new Date().toISOString(),
        };
        await supabaseAdmin.from('users').insert(newProfile);
      }
    } else if (profile) {
      role = profile.role || 'buyer';
    }

    // Redirect sesuai role
    if (role === 'admin') {
      return res.redirect('/admin/dashboard');
    } else {
      return res.redirect('/account');
    }
  } catch (err) {
    console.error('OAuth callback handler error:', err);
    return res.redirect('/login');
  }
}
