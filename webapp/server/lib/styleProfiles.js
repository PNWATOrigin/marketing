// Four user references, visually inspected 2026-09-11. References are never render inputs.
export const STYLE_PROFILES = {
  digital: { id:'digital-usage-v1', references:[14.28,18.16], captionY:1260, accent:'0x66D9EF', captionBox:true, motion:['push','pan','pull'], preferred:['USAGE','LIFESTYLE','PRODUCT_HERO','DETAIL'], closing:1.3 },
  health: { id:'health-routine-v1', references:[53.43,32.90], captionY:1220, accent:'0xFF9EC5', captionBox:false, motion:['push','pull','pan'], preferred:['LIFESTYLE','PRODUCT_HERO','CLOSEUP','INFOGRAPHIC'], closing:1.5 },
};
export function styleFor(category, purpose) {
  const base = STYLE_PROFILES[category] || STYLE_PROFILES.digital;
  return { ...base, purpose, hookTarget: purpose === 'views' ? 0.9 : 1.2, bodyTarget: purpose === 'brand' ? 2 : 1.6, closing: purpose === 'brand' ? 1.8 : base.closing };
}
