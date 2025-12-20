import React from 'react';

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[350px] h-[700px] bg-gray-900 rounded-[50px] p-4 shadow-2xl border-[8px] border-gray-800 ring-1 ring-white/20 select-none">
      {/* Dynamic Island */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[100px] h-[28px] bg-black rounded-full z-50 flex justify-center items-center transition-all duration-300 hover:w-[120px] hover:h-[32px] cursor-default">
        <div className="flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity duration-300">
           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
           <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        </div>
      </div>
      
      {/* Screen */}
      <div className="w-full h-full bg-[#F2F2F7] rounded-[40px] overflow-hidden relative font-sans text-slate-900">
        {/* Status Bar */}
        <div className="absolute top-0 w-full h-12 flex justify-between items-end px-8 pb-2 text-xs font-semibold z-40 text-black/80">
          <span>9:41</span>
          <div className="flex gap-1.5 items-center">
            <div className="h-2.5 w-4 border border-current rounded-sm flex items-center justify-start px-[1px]">
               <div className="h-1.5 w-full bg-current rounded-[1px]" />
            </div>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="h-full w-full overflow-y-auto no-scrollbar pt-12 pb-8">
            {children}
        </div>
        
        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-black/80 rounded-full z-50" />
      </div>
      
      {/* Side Buttons */}
      <div className="absolute top-24 -left-[10px] w-[2px] h-8 bg-gray-700 rounded-l-md" /> {/* Silent */}
      <div className="absolute top-36 -left-[10px] w-[2px] h-14 bg-gray-700 rounded-l-md" /> {/* Vol Up */}
      <div className="absolute top-52 -left-[10px] w-[2px] h-14 bg-gray-700 rounded-l-md" /> {/* Vol Down */}
      <div className="absolute top-44 -right-[10px] w-[2px] h-20 bg-gray-700 rounded-r-md" /> {/* Power */}
    </div>
  );
}
