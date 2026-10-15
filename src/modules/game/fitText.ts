/** Smallest size the active line shrinks to. Below 16px iOS also zooms the page in when a blank is focused. */
export const MIN_FIT_FONT_PX = 16

/**
 * The largest whole-pixel font size, between `min` and `natural`, at which
 * `fits` says the text fits. Returns null when the natural size already fits
 * (leave the font alone), and `min` when nothing does (the panel then scrolls
 * to the open blank instead). `fits` is called about log2(natural - min)
 * times, each a layout read, so this stays cheap.
 */
export function fitFontSize(natural: number, fits: (px: number) => boolean, min = MIN_FIT_FONT_PX): number | null {
  if (natural <= min || fits(natural)) return null
  let low = min
  let high = Math.floor(natural) - 1
  if (!fits(low)) return min
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid - 1
  }
  return low
}
