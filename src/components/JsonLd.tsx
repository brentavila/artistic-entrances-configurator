export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      className="noswap"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
