import React from 'react';
import { Home, Globe, Library, Award } from 'lucide-react';
import clsx from 'clsx';

export type PageType = 'home' | 'community' | 'garden' | 'reward';

interface BottomNavigationProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentPage, onPageChange }) => {
  const navItems = [
    { id: 'home', label: '主页', icon: Home },
    { id: 'community', label: '社区', icon: Globe },
    { id: 'garden', label: '知识', icon: Library },
    { id: 'reward', label: '激励', icon: Award },
  ];

  return (
    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-[calc(100%-2rem)] flex justify-center">
      <div className="flex items-center gap-1 p-1.5 bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl shadow-black/5 rounded-full ring-1 ring-black/5">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id as PageType)}
              className={clsx(
                "relative flex items-center justify-center px-4 py-2.5 rounded-full transition-all duration-300",
                isActive 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={clsx("transition-transform duration-300 shrink-0", isActive && "scale-105")} />
              {isActive && (
                <span className="ml-2 text-[11px] font-bold tracking-wide animate-in fade-in slide-in-from-left-2 duration-200 whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
