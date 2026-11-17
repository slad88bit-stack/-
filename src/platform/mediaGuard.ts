import { yandexSdk } from './yandexSdk';

export function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function canOfferPopoutTab(): boolean {
  // Offer pop-out tab on itch.io / generic embeds so camera & mic work outside cross-origin iframe,
  // but never on Yandex Games (where external window navigation is disallowed).
  return isEmbeddedIframe() && !yandexSdk.isAvailable();
}

export function formatMediaAccessError(kind: 'camera' | 'mic', err: unknown): string {
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : '';
  const label = kind === 'camera' ? 'камеру' : 'микрофон';

  if (
    isEmbeddedIframe() &&
    (name === 'NotAllowedError' ||
      name === 'SecurityError' ||
      /permission|policy|denied|iframe|feature/i.test(msg))
  ) {
    return `Сайт (например, itch.io) блокирует ${label} внутри встроенного iframe. Нажми «Открыть в новой вкладке ↗», чтобы ${
      kind === 'camera' ? 'камера заработала' : 'микрофон заработал'
    }!`;
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return `Доступ к ${kind === 'camera' ? 'камере' : 'микрофону'} запрещён в браузере. Разреши доступ в адресной строке (значок замка).`;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return kind === 'camera'
      ? 'Веб-камера не найдена. Подключи камеру и попробуй снова.'
      : 'Микрофон не найден. Подключи микрофон и попробуй снова.';
  }
  if (name === 'NotReadableError') {
    return `${kind === 'camera' ? 'Камера' : 'Микрофон'} уже используется другой программой (OBS, Discord, Zoom).`;
  }

  return msg || `Не удалось включить ${label}. Проверь разрешения браузера.`;
}
