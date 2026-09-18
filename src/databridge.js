import axios from 'axios';

// databridge-api parcel queries: table-style queries whose features come back as
// GeoJSON, shaped like an AGO f=geojson response. Spatial wheres only run on the
// Carto V3 backend, so the service is pinned. Callers gate on config.databridge
// ({ url, clientId }) - apps without it keep their AGO paths.

const PARCEL_TABLES = {
  pwd: 'pwd_parcels',
};

// the databridge table backing a parcel layer, or undefined if it has none
export function databridgeParcelTable(parcelLayer) {
  return PARCEL_TABLES[parcelLayer];
}

export function pointWhere(latlng) {
  return "ST_Intersects(shape, ST_Transform(ST_SetSRID(ST_Point(" + latlng.lng + "," + latlng.lat + "),4326),2272))";
}

// ring: a closed [ [lng, lat], ... ] polygon ring
export function ringWhere(ring) {
  const poly = ring.map(coord => coord[0] + ' ' + coord[1]).join(',');
  return "ST_Intersects(shape, ST_Transform(ST_SetSRID(ST_GeomFromText('POLYGON((" + poly + "))'),4326),2272))";
}

export function fetchDatabridgeFeatures(databridge, table, where) {
  const params = {
    table: table,
    where: where,
    out_sr: 4326,
    service: 'carto',
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
