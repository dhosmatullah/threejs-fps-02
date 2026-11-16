// The look plan, in one place: a riverside night-market compound at dusk. Warm lantern
// amber against deep blue night, sand plaster and teal-painted walls, rust-red roofs.
// Team colours are part of the palette so a silhouette reads at a glance: the home
// squad (Penjaga) wears lagoon blue, the river gang (Sungai) wears ember red.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#0c0e14', // night sky / page background
  ground: '#3a3f4a', // worn asphalt of the compound yard
  plaster: '#9a7f5c', // sand-coloured plaster walls
  teal: '#2f6f6a', // teal-painted walls and doors
  wood: '#6e4f30', // market stall timber and crates
  roof: '#8a3b2e', // rust-red tile roofs
  ink: '#f2ead8', // warm paper white for text and light
  muted: '#8f97a5', // cool grey for secondary text
  accent: '#ffb347', // lantern amber, the one accent
  penjaga: '#3d9bc4', // home squad blue
  sungai: '#d95f43', // river gang red
  leaf: '#3f6b3a', // banana-leaf green of the planters
};

export function color(name) {
  return PALETTE[name];
}
