import proj4 from 'proj4';
import axios from 'axios';
import explode from '@turf/explode';
import nearest from '@turf/nearest-point';
import { point, polygon, isNumber } from '@turf/helpers';
import distance from '@turf/distance';
import area from '@turf/area';
import utils from '../utils.js';
import { fetchDatabridgeFeatures, ringWhere } from '../databridge.js';

import BaseClient from './base-client';

class BufferSearchClient extends BaseClient {

  fetchBufferShape(error = [], featureCollection = [], response = {}, parcelLayer, latlng) {
    console.log('fetchBufferShape is running, error:', error, 'featureCollection:', featureCollection, 'response:', response, 'parcelLayer', parcelLayer, 'latlng:', latlng);

    const projection4326 = utils.projection4326;
    const projection2272 = utils.projection2272;

    const parcelUrl = this.config.map.featureLayers.pwdParcels;
    // const geometryServerUrl = this.config.map.tools.geometryServer;
    // const geometryServerUrl = '//gis-utils.databridge.phila.gov/arcgis/rest/services/Utilities/Geometry/GeometryServer/';
    const geometryServerUrl = 'https://citygeo-geocoder-pub.databridge.phila.gov/arcgis/rest/services/Utilities/Geometry/GeometryServer/';
    // console.log('geometryServerUrl:', geometryServerUrl);
    const calculateDistance = true;
    const distances = 250;

    // if you do it by point
    const coords = [ latlng.lng, latlng.lat ];
    const coords2272 = proj4(projection4326, projection2272, [ coords[0], coords[1] ]);
    // console.log('coords:', coords, 'coords2272:', coords2272);

    // if you do it by parcel
    const parcelGeom = response.features[0].geometry;
    
    let polyCoords2272 = [];
    for (let polyCoord of parcelGeom.coordinates[0]) {
      let polyCoord2272 = proj4(projection4326, projection2272, [ polyCoord[0], polyCoord[1] ]);
      polyCoords2272.push(polyCoord2272);
    }
    
    let newGeometries = {
      "geometryType": "esriGeometryPolygon",
      "geometries": [{ "rings": [ polyCoords2272 ]}],
    };
    console.log('parcelGeom:', parcelGeom, 'newGeometries:', newGeometries);

    const params = {
      // geometries: `[${coords2272.join(', ')}]`,
      geometries: newGeometries,
      inSR: 2272,
      outSR: 4326,
      bufferSR: 2272,
      distances: distances, //|| 0.0028,
      unionResults: true,
      geodesic: false,
      f: 'json',
    };
    // console.log('esri nearby params', params);

    // get buffer polygon
    const bufferUrl = geometryServerUrl.replace(/\/$/, '') + '/buffer';
    // console.log('bufferUrl:', bufferUrl);

    const bufferShapeSuccess = this.bufferShapeSuccess.bind(this);
    const bufferShapeError = this.bufferShapeError.bind(this);

    // fully encode params - the geometry server's tomcat rejects raw brackets in query strings
    const paramsSerializer = p => Object.keys(p).map(key => {
      const value = p[key];
      return key + '=' + encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : value);
    }).join('&');

    return axios.get(bufferUrl, { params, paramsSerializer })
      .then(bufferShapeSuccess)
      .catch(bufferShapeError);

  }

  bufferShapeSuccess(response) {
    console.log('bufferShapeSuccess, response:', response);

    const store = this.store;
    const data = response.data;
    // console.log('axios in finishParcelsByBuffer is running, response:', response);//, 'data:', data);

    // console.log('did get esri nearby buffer', data);

    const geoms = data.geometries || [];
    const geom = geoms[0] || {};
    const rings = geom.rings || [];
    const xyCoords = rings[0];

    // check for xy coords
    if (!xyCoords) {
      // we can't do anything without coords, so bail out
      // this.dataManager.didFetchData(dataSourceKey, 'error');
      return;
    }

    const latLngCoords = xyCoords.map(xyCoord => [ ...xyCoord ].reverse());

    // get nearby features using buffer
    // const buffer = L.polygon(latLngCoords);
    const map = store.state.map.map;

    // DEBUG
    store.commit('setBufferShape', latLngCoords);
    return xyCoords;
  }

  bufferShapeError(error) {
    // console.log('bufferShapeError:', error);
  }

  // thins a buffer ring to every 3rd vertex (rounded to 6 decimals) and closes it
  thinRing(xyCoords) {
    let ring = [[ parseFloat(xyCoords[0][0].toFixed(6)), parseFloat(xyCoords[0][1].toFixed(6)) ]];
    var i;
    for (i = 0; i < xyCoords.length; i++) {
      if (i%3 == 0) {
        let coord = [ parseFloat(xyCoords[i][0].toFixed(6)), parseFloat(xyCoords[i][1].toFixed(6)) ];
        ring.push(coord);
      }
    }
    ring.push([ parseFloat(xyCoords[0][0].toFixed(6)), parseFloat(xyCoords[0][1].toFixed(6)) ]);
    return ring;
  }

  // stamps each feature with _distance (feet) from the given [lng, lat] point
  addDistances(features, calculateDistancePt) {
    const from = point(calculateDistancePt);

    return features.map(feature => {
      const featureCoords = feature.geometry.coordinates;
      let dist;
      if (Array.isArray(featureCoords[0])) {
        let polygonInstance;
        try {
          polygonInstance = polygon([ featureCoords[0] ]);
          const vertices = explode(polygonInstance);
          const closestVertex = nearest(from, vertices);
          dist = distance(from, closestVertex, { units: 'miles' });
        } catch (e) {
          // console.log('error in distance to polygon:', e);
        }

      } else {
        const to = point(featureCoords);
        dist = distance(from, to, { units: 'miles' });
      }

      // TODO make distance units an option. for now, just hard code to ft.
      const distFeet = parseInt(dist * 5280);
      // console.log('distFeet:', distFeet);

      feature._distance = distFeet;

      return feature;
    });
  }

  // buffer search through databridge-api instead of the AGO PWD_PARCELS layer.
  // Needs config.databridge { url, clientId }.
  fetchPwdParcelsByShape(xyCoords, calculateDistancePt) {
    const ring = this.thinRing(xyCoords);
    return fetchDatabridgeFeatures(this.config.databridge, 'pwd_parcels', ringWhere(ring)).then(featureCollection => {
      let features = featureCollection.features;
      if (calculateDistancePt) {
        features = this.addDistances(features, calculateDistancePt);
      }
      return { features: features };
    });
  }

  fetchBySpatialQuery(url, relationship, xyCoords, parameters = {}, calculateDistancePt, options = {}) {
    // console.log('bufferSearch fetch esri spatial query, url:', url, 'relationship:', relationship, 'xyCoords:', xyCoords, 'parameters:', parameters, 'options:', options, 'calculateDistancePt:', calculateDistancePt);
    const parcelLayer = [];

    let xyCoords2 = this.thinRing(xyCoords);
    console.log('xyCoords2:', xyCoords2);

    const addDistances = features => this.addDistances(features, calculateDistancePt);

    let theGeom = { "rings": [ xyCoords2 ], "spatialReference": { "wkid": 4326 }};

    return new Promise(function(resolve, reject) {

      let params = {
        'returnGeometry': true,
        'where': '1=1',
        'outSR': 4326,
        'outFields': '*',
        'inSr': 4326,
        'geometryType': 'esriGeometryPolygon',
        'spatialRel': 'esriSpatialRelIntersects',
        'f': 'geojson',
        'geometry': theGeom,
      };

      axios.get(url, { params }).then(function(response, error) {
      // query.run((function(error, featureCollection, response) {
        if (error) {
          reject(error);
        } else {
          console.log('did get esri spatial query, response:', response);

          let featureCollection = response.data;
          let features = (featureCollection || {}).features;
          const status = error ? 'error' : 'success';

          // calculate distance
          if (calculateDistancePt) {
            features = addDistances(features);
          }
          resolve(response.data);
        }
      });
    });
  }

}

export default BufferSearchClient;
