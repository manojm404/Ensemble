import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getProfile } from '@/lib/api';

interface User {
  id: string;
  full_name: string;
  email: string;
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  login: (userData: User) => void;
  logout: () => void;
  refetchUser: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('ensemble_auth_token');
      if (token) {
        const userData = await getProfile();
        setUser(userData);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('ensemble_auth_token');
    localStorage.removeItem('ensemble_refresh_token');
    localStorage.removeItem('ensemble_token_expires_at');
    setUser(null);
  };

  const refetchUser = () => {
    fetchUser();
  };

  return (
    <UserContext.Provider value={{ user, isLoading, login, logout, refetchUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
