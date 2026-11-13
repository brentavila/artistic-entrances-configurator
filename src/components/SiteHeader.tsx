"use client";

import { useState } from "react";
import { business } from "@/lib/business";

const links = [
  { href: "/projects", label: "Projects" },
  { href: "/gallery", label: "Gallery" },
  { href: "/design-your-door", label: "Design" },
  { href: "/las-vegas-iron-doors", label: "Las Vegas" },
  { href: "/catalog", label: "Catalog" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Artistic Entrances home">
        <img src="/brand/logo-horizontal.png" alt="" width={196} height={95} />
      </a>
      <nav className={open ? "site-nav is-open" : "site-nav"} aria-label="Primary">
        <button
          aria-controls="primary-nav"
          aria-expanded={open}
          className="nav-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Close" : "Menu"}
        </button>
        <div className="nav-links" id="primary-nav">
          {links.map((link) => (
            <a data-cta={link.href === "/catalog" ? "request_catalog" : undefined} data-cta-location="header_nav" href={link.href} key={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>
      </nav>
      <a className="header-phone" data-cta-location="header" href={`tel:${business.phoneTel}`}>
        {business.phoneDisplay}
      </a>
      <a className="header-cta" data-cta="design_your_door" data-cta-location="header" href="/design-your-door">
        Design Your Door
      </a>
    </header>
  );
}
