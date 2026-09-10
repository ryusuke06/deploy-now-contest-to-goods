export const PRINT_SIZE = 1732;

export function normalizeSiteUrl(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2048)
    throw new Error("サイトのURLを入力してください。");
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("正しいURLを入力してください。");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+lolipop-now\.app$/.test(
      url.hostname,
    )
  ) {
    throw new Error(
      "https:// で始まる *.lolipop-now.app のURLを指定してください。",
    );
  }
  return url.href;
}
