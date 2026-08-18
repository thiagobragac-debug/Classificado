'use client';

import React, { createContext, useContext } from 'react';
import { CATEGORIES as DEFAULT_CATEGORIES } from './constants';

const CategoriesContext = createContext<any[]>(DEFAULT_CATEGORIES);

export function CategoriesProvider({
  categories,
  children,
}: {
  categories: any[];
  children: React.ReactNode;
}) {
  return (
    <CategoriesContext.Provider value={categories?.length > 0 ? categories : DEFAULT_CATEGORIES}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
