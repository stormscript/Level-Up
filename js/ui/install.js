// Deteção de iPhone/iPad e do modo "instalado" (aberto a partir do ecrã principal).

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/** Mostrar o banner "Adicionar ao ecrã principal"? Só no Safari do iPhone, fora da app instalada. */
export const shouldShowInstallBanner = (dismissed) => isIOS() && !isStandalone() && !dismissed;
