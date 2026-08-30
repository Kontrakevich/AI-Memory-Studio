import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, X } from "lucide-react";

type Props = {
  title: string;
  hint: string;
  slot: string;
  value: File | null;
  onChange: (file: File | null) => void;
  busy?: boolean;
};

export function PhotoCard({ title, hint, slot, value, onChange, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <input
        ref={inputRef}
        id={`photo-${slot}`}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (file) onChange(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="block w-full text-left"
        aria-label={`Выбрать фото: ${title}`}
      >
        <div className="relative aspect-[3/4] w-full bg-secondary">
          {previewUrl ? (
            <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
              <ImagePlus className="size-7 text-primary" />
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                выбрать из Фото
              </span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/80 to-transparent p-3 pt-8">
            <p className="text-sm font-medium uppercase tracking-[0.16em]">{title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
          </div>
        </div>
      </button>

      {value ? (
        <div className="flex border-t border-border">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
          >
            <RefreshCw className="size-3.5" />
            Заменить
          </button>
          <span className="w-px bg-border" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={busy}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
          >
            <X className="size-3.5" />
            Удалить
          </button>
        </div>
      ) : null}
    </div>
  );
}
