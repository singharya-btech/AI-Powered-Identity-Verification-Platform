import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserProfile, AuthResponse, setAuthToken, registerUnauthorizedHandler } from '../services/api';
import { authService, LoginPayload, RegisterPayload } from '../services/authService';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginPayload) => Promise<AuthResponse>;
  register: (payload: RegisterPayload) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    authService.logout();
  }, []);

  // Listen for 401 unauthorized errors from axios interceptor
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      logout();
    });
  }, [logout]);

  const login = async (credentials: LoginPayload): Promise<AuthResponse> => {
    setIsLoading(true);
    try {
      const data = await authService.login(credentials);
      setToken(data.access_token);
      setUser(data.user);
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: RegisterPayload): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const data = await authService.register(payload);
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async (): Promise<UserProfile | null> => {
    if (!token) return null;
    setIsLoading(true);
    try {
      const updatedUser = await authService.getCurrentUser();
      setUser(updatedUser);
      return updatedUser;
    } catch {
      logout();
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

