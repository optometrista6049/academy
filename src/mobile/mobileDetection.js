export function isMobile(){
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
        return true;
    }
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
        return true;
    }
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1366) {
        return true;
    }
    return false;
}