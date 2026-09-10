export type ItemVariant = {
  id: number;
  enabled?: boolean;
  exemplary?: boolean;
  size?: { name: string };
  color?: { name: string };
};
export type SuzuriProduct = {
  id?: number;
  item?: { id: number };
  sampleUrl?: string;
  url?: string;
};
export function productPageUrl(
  product: SuzuriProduct,
  materialId: number,
  variant: ItemVariant,
): string | null {
  const candidates = [product.sampleUrl];
  if (product.url && variant.size?.name && variant.color?.name)
    candidates.push(
      product.url
        .replace("{size}", encodeURIComponent(variant.size.name))
        .replace("{color}", encodeURIComponent(variant.color.name)),
    );
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "suzuri.jp" ||
        url.username ||
        url.password ||
        url.port
      )
        continue;
      if (
        !new RegExp(`^/[^/]+/${materialId}/acrylic-block/[^/]+/[^/]+/?$`).test(
          url.pathname,
        ) ||
        /[{}]|%7[bBdD]/.test(url.pathname)
      )
        continue;
      return url.href;
    } catch {}
  }
  return null;
}
