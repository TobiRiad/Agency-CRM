"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getClientPB, login as pbLogin, register as pbRegister, logout as pbLogout, getCurrentUser, isAuthenticated } from "@/lib/pocketbase";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(() => {
    const pb = getClientPB();
    const currentUser = getCurrentUser(pb);
    setUser(currentUser);
  }, []);

  useEffect(() => {
    // Initial auth check
    const pb = getClientPB();
    const currentUser = getCurrentUser(pb);
    setUser(currentUser);
    setIsLoading(false);

    // Listen for auth changes
    pb.authStore.onChange((_, model) => {
      setUser(model as User | null);
    });
  }, []);

  const login = async (email: string, password: string) => {
    const pb = getClientPB();
    setIsLoading(true);
    try {
      await pbLogin(pb, email, password);
      setUser(getCurrentUser(pb));
      router.push("/campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    const pb = getClientPB();
    setIsLoading(true);
    try {
      await pbRegister(pb, email, password, name);
      setUser(getCurrentUser(pb));
      router.push("/campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    const pb = getClientPB();
    pbLogout(pb);
    setUser(null);
    router.push("/login");
  };

  const isLoggedIn = isAuthenticated(getClientPB());

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
