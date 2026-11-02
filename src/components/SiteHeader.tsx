import { business } from "@/lib/business";

const links = [
  { href: "/gallery", label: "Gallery" },
  { href: "/design-your-door", label: "Design" },
  { href: "/las-vegas-iron-doors", label: "Las Vegas" },
  { href: "/catalog", label: "Catalog" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Artistic Entrances home">
        <span>AE</span>
        <div>
          <strong>Artistic Entrances</strong>
          <small>Las Vegas Iron Doors</small>
        </div>
      </a>
      <nav className="site-nav" aria-label="Primary">
        <details className="nav-details">
          <summary>Menu</summary>
          <div className="nav-links">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        </details>
      </nav>
      <a className="header-phone" href={`tel:${business.phoneTel}`}>
        {business.phoneDisplay}
      </a>
      <a className="header-cta" href="/design-your-door">
        Design Your Door
      </a>
    </header>
  );
}
