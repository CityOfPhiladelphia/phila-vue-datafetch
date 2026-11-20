import axios from 'axios';

// databridge-api parcel queries: table-style queries whose features come back as
// GeoJSON, shaped like an AGO f=geojson response. Callers gate on config.databridge
// ({ url, clientId }) - apps without it keep their AGO paths.
// Each query is the params that pick the rows. A plain where and the API's x/y
// point-in-polygon lookup run on PostgREST; a spatial where only runs on the Carto V3
// backend, which counts against the Carto quota, so only the ring query pins it.

const PARCEL_TABLES = {
  pwd: 'pwd_parcels',
};

// the databridge table backing a parcel layer, or undefined if it has none
export function databridgeParcelTable(parcelLayer) {
  return PARCEL_TABLES[parcelLayer];
}

// the polygons containing a 4326 point
export function pointQuery(latlng) {
  return { x: latlng.lng, y: latlng.lat };
}

// the polygons intersecting a closed [ [lng, lat], ... ] polygon ring
export function ringQuery(ring) {
  const poly = ring.map(coord => coord[0] + ' ' + coord[1]).join(',');
  return {
    where: "ST_Intersects(shape, ST_Transform(ST_SetSRID(ST_GeomFromText('POLYGON((" + poly + "))'),4326),2272))",
    service: 'carto',
  };
}

export function fetchDatabridgeFeatures(databridge, table, query) {
  const params = {
    table: table,
    ...query,
    out_sr: 4326,
    client_id: databridge.clientId,
  };
  return axios.get(databridge.url, { params }).then(response => {
    let features = ((response.data || {}).data || {}).features || [];
    features = features.map(feature => {
      // single-polygon MultiPolygons unwrap to plain Polygons, the shape the
      // AGO layers serve and downstream geometry code expects
      let geometry = feature.geometry;
      if (geometry && geometry.type === 'MultiPolygon' && geometry.coordinates.length === 1) {
        geometry = { type: 'Polygon', coordinates: geometry.coordinates[0] };
      }
      return { type: 'Feature', properties: feature.properties, geometry: geometry };
    });
    return { type: 'FeatureCollection', features: features };
  });
}
