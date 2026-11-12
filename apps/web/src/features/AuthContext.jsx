import { createContext, useContext, useEffect, useState } from 'react';
import { authApi, usersApi } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authApi.me()
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  async function login(credentials) {
    const { user: authenticatedUser } = await authApi.login(credentials);
    setUser(authenticatedUser);
    return authenticatedUser;
  }

  async function register(details) {
    const { user: registeredUser } = await authApi.register(details);
    setUser(registeredUser);
    return registeredUser;
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  async function updateProfile(details) {
    const { user: updatedUser } = await usersApi.updateMe(details);
    setUser(updatedUser);
    return updatedUser;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}