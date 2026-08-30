export const ACTIVE_JOB_KEY = "hug.activeJobId";
export const TEST_MODE_KEY = "hug.testMode";

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export type PhotoContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif";

const PHOTO_TYPES = new Set<PhotoContentType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function photoContentType(file: File): PhotoContentType {
  const direct = file.type.trim().toLowerCase();
  if (PHOTO_TYPES.has(direct as PhotoContentType)) return direct as PhotoContentType;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";

  throw new Error("Формат фото не распознан. Используйте JPEG, PNG, WebP, HEIC или HEIF.");
}

export function validatePhotoFile(file: File) {
  if (file.size <= 0) throw new Error("Выбранный файл пустой.");
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Фото больше 25 МБ. Выберите исходный файл меньшего размера, не скриншот.");
  }
  return photoContentType(file);
}

export async function uploadOriginalPhoto(
  file: File,
  ticket: { uploadUrl: string; pathname: string; contentType: PhotoContentType },
) {
  const contentType = validatePhotoFile(file);
  if (contentType !== ticket.contentType) {
    throw new Error("Тип файла изменился перед загрузкой. Выберите фото заново.");
  }

  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).trim();
    } catch {
      detail = "";
    }
    const suffix = detail ? `: ${detail.slice(0, 220)}` : "";
    throw new Error(
      `Защищённое хранилище отклонило загрузку фото (код ${response.status})${suffix}`,
    );
  }

  return {
    path: ticket.pathname,
    contentType,
    size: file.size,
  };
}

export function readLocal(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    value === null ? window.localStorage.removeItem(key) : window.localStorage.setItem(key, value);
  } catch {}
}
