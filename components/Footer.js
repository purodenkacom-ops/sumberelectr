import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser } from '@fortawesome/free-solid-svg-icons';
import Image from 'next/image';

const DEFAULT_LOGO = '/logo.png'; // gunakan file di /public

const Footer = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [userId, setUserId] = useState(null);
  const [userPhoto, setUserPhoto] = useState(null);
  const [scrolling, setScrolling] = useState(false);

  // Sync auth & photo from Supabase AuthContext
  useEffect(() => {
    if (user) {
      setUserId(user.id || user.uid);
      setUserPhoto(
        user.profile?.avatar ||
        user.avatar ||
        user.user_metadata?.avatar_url ||
        user.photoURL ||
        null
      );
    } else {
      setUserId(null);
      setUserPhoto(null);
    }
  }, [user]);

  // Scroll transparency handling
  useEffect(() => {
    let t;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(t);
      t = setTimeout(() => setScrolling(false), 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(t);
    };
  }, []);

  const goAccount = () => {
    if (userId) router.push('/account');
    else {
      localStorage.setItem('redirectAfterLogin', '/account');
      router.push('/login');
    }
  };

  const imgFallback = (e) => { e.currentTarget.src = DEFAULT_LOGO; };

  return (
    <button
      onClick={goAccount}
      aria-label={userId ? 'Akun' : 'Login'}
      className={`fixed bottom-5 right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition
        backdrop-blur bg-white/80 border border-orange-200
        ${scrolling ? 'opacity-70' : 'opacity-100'} hover:opacity-100`}
      style={{ zIndex: 60 }}
    >
      {!userId && (
        <Image
          src={DEFAULT_LOGO}
          alt="Login"
          width={48}
          height={48}
          className="w-12 h-12 rounded-full object-cover border border-orange-300"
          onError={imgFallback}
          priority
        />
      )}

      {userId && userPhoto && (
        <Image
          src={userPhoto}
          alt="Akun"
          width={48}
          height={48}
          className="w-12 h-12 rounded-full object-cover border border-orange-300"
          onError={imgFallback}
          priority
        />
      )}

      {userId && !userPhoto && (
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <FontAwesomeIcon icon={faUser} />
        </div>
      )}

      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[18px] font-medium text-red-600 select-none">
        {userId ? ' ' : 'Login'}
      </span>
    </button>
  );
};

export default Footer;
