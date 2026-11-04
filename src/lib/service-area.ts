const zips = new Set<string>([
  "89002",
  "89005",
  "89011",
  "89012",
  "89014",
  "89015",
  "89030",
  "89031",
  "89032",
  "89044",
  "89052",
  "89074",
  "89081",
  "89084",
  "89085",
  "89086",
]);

for (let zip = 89101; zip <= 89123; zip += 1) zips.add(String(zip));
for (let zip = 89128; zip <= 89131; zip += 1) zips.add(String(zip));
for (let zip = 89134; zip <= 89135; zip += 1) zips.add(String(zip));
for (let zip = 89138; zip <= 89149; zip += 1) zips.add(String(zip));
for (const zip of ["89124", "89161", "89166", "89169", "89178", "89179", "89183"]) {
  zips.add(zip);
}

export function zip5(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.slice(0, 5);
}

export function isGreaterLasVegasZip(value: string) {
  const zip = zip5(value);
  return zip.length === 5 && zips.has(zip);
}

export function serviceAreaForZip(value: string) {
  const zip = zip5(value);
  const inArea = isGreaterLasVegasZip(zip);
  return {
    zip,
    inArea,
    label: inArea ? "Greater Las Vegas" : "Outside greater Las Vegas",
    mockupEligible: inArea,
  };
}
