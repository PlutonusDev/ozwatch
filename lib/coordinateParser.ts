export const parseCoordinateString = (coordStr: string): [number, number] | null => {
  // Regex to split Lat and Lon (looking for the +/- separator in the middle)
  // The string always starts with + or -, then numbers, then another + or - for Lon
  const match = coordStr.match(/^([+-]\d+\.?\d*)([+-]\d+\.?\d*)$/);
  
  if (!match) return null;

  const latRaw = match[1];
  const lonRaw = match[2];

  const parseDMS = (raw: string, isLon: boolean): number => {
    const sign = raw.startsWith('-') ? -1 : 1;
    const clean = raw.substring(1); // Remove sign
    
    // Longitude has 3 digits for degrees, Latitude has 2
    const degLen = isLon ? 3 : 2;
    
    const deg = parseFloat(clean.substring(0, degLen));
    const min = parseFloat(clean.substring(degLen, degLen + 2));
    const sec = parseFloat(clean.substring(degLen + 2));

    return sign * (deg + min / 60 + sec / 3600);
  };

  const lat = parseDMS(latRaw, false);
  const lon = parseDMS(lonRaw, true);

  if (isNaN(lat) || isNaN(lon)) return null;

  return [lat, lon];
};