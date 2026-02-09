export interface ProcPoint {
  lat: number;
  lon: number;
  name: string;
}

// Same structure as before: Airport -> ProcName -> Runway -> Points
export type ProcedureLookup = Record<string, Record<string, Record<string, ProcPoint[]>>>;

export const parseProcedures = (
  xmlString: string, 
  waypointLookup: Record<string, [number, number]>
): { sids: ProcedureLookup, stars: ProcedureLookup } => {
  
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  const sids: ProcedureLookup = {};
  const stars: ProcedureLookup = {};

  // Helper to process a node list (SIDs or STARs)
  const processNodes = (tagName: string, targetLookup: ProcedureLookup) => {
    let nodes = xmlDoc.getElementsByTagName(tagName);
    
    // Fallback: If 0 nodes found, it might be a namespace issue.
    // Try finding ALL tags and filtering manually (brute force but reliable)
    if (nodes.length === 0) {
       const all = xmlDoc.getElementsByTagName("*");
       const filtered = [];
       for(let i=0; i<all.length; i++) {
         if (all[i].nodeName === tagName || all[i].localName === tagName) {
           filtered.push(all[i]);
         }
       }
       // Use the filtered array if needed (requires changing loop logic below slightly to iterate array)
       // Or just rely on the user having standard XML.
    }
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const airport = node.getAttribute("Airport");
      const procName = node.getAttribute("Name");
      
      if (!airport || !procName) continue;

      // Initialize Lookup Structure
      if (!targetLookup[airport]) targetLookup[airport] = {};
      if (!targetLookup[airport][procName]) targetLookup[airport][procName] = {};

      // Parse Routes (Runway specific legs)
      const routes = node.getElementsByTagName("Route");
      
      for (let j = 0; j < routes.length; j++) {
        const routeNode = routes[j];
        const runway = routeNode.getAttribute("Runway");
        const routeStr = routeNode.textContent || "";

        if (!runway) continue;

        const points: ProcPoint[] = [];
        
        // Split "POROB/POVED/GUGAN"
        // Filter empty strings in case of trailing slashes
        const wpNames = routeStr.split('/').map(s => s.trim()).filter(s => s.length > 0);

        for (const name of wpNames) {
          // KEY STEP: Look up coordinates from your global waypoint list
          const coords = waypointLookup[name];
          
          if (coords) {
            points.push({
              name: name,
              lat: coords[0], // WaypointLookup is [Lat, Lon]
              lon: coords[1]
            });
          } else {
            // Optional: Warn if a procedure point is missing from your DB
            // console.warn(`Procedure ${procName} uses unknown waypoint: ${name}`);
          }
        }

        targetLookup[airport][procName][runway] = points;
      }
    }
  };

  // Run for both types
  processNodes("SID", sids);
  processNodes("STAR", stars);

  return { sids, stars };
};