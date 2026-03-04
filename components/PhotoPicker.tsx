"use client";

import { useRef } from "react";

export default function PhotoPicker({
  onPick,
  className = "",
  cameraLabel = "+ 拍照",
  galleryLabel = "+ 从图库选择",
  disabled = false,
}: {
  onPick: (file: File) => void;
  className?: string;
  cameraLabel?: string;
  galleryLabel?: string;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={`flex gap-2 ${className}`}>
      {/* 拍照：capture 会强制/优先打开相机（移动端） */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
        className="px-3 py-2 rounded-xl bg-black text-white text-sm active:scale-[0.99] disabled:opacity-70"
      >
        {cameraLabel}
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />

      {/* 图库：不写 capture，就会允许从相册/文件选择 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => galleryRef.current?.click()}
        className="px-3 py-2 rounded-xl border text-sm active:scale-[0.99] disabled:opacity-70"
      >
        {galleryLabel}
      </button>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}