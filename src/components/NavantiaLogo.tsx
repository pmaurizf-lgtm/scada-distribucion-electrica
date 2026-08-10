/** Logo corporativo Navantia (horizontal oficial). */

type Props = {
  className?: string
}

export function NavantiaLogo({ className }: Props) {
  return (
    <img
      className={`navantia-logo${className ? ` ${className}` : ''}`}
      src="/navantia-logo.webp"
      alt="Navantia"
      width={198}
      height={25}
      decoding="async"
    />
  )
}
