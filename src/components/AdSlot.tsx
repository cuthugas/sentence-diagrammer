interface Props {
  label?: string
  className?: string
}

/**
 * Placeholder ad slot. Once AdSense approves the site, replace the inner div
 * with the <ins class="adsbygoogle"> snippet for this slot and load the
 * AdSense script tag in index.html.
 */
export function AdSlot({ label = 'Advertisement', className }: Props) {
  return (
    <div className={`ad-slot ${className ?? ''}`}>
      <span>{label}</span>
    </div>
  )
}
