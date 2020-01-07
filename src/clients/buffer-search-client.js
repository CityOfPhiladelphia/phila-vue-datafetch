import proj4 from 'proj4';
import axios from 'axios';
import explode from '@turf/explode';
import nearest from '@turf/nearest-point';
import { query as Query } from 'esri-leaflet';
import { point, polygon, isNumber } from '@turf/helpers';
import distance from '@turf/distance';
import area from '@turf/area';
import utils from '../utils.js';

import BaseClient from './base-client';
// require('lodash');


class BufferSearchClient extends BaseClient {

  fetchBufferShape(error = [], featureCollection = [], response = {}, parcelLayer, latlng) {
    // console.log('fetchBufferShape is running, error:', error, 'featureCollection:', featureCollection, 'response:', response, 'parcelLayer', parcelLayer, 'latlng:', latlng);

    const projection4326 = utils.projection4326;
    const projection2272 = utils.projection2272;

    const parcelUrl = this.config.map.featureLayers.pwdParcels;
    // const geometryServerUrl = this.config.map.tools.geometryServer;
    const geometryServerUrl = '//gis-utils.databridge.phila.gov/arcgis/rest/services/Utilities/Geometry/GeometryServer/';
    // console.log('geometryServerUrl:', geometryServerUrl);
    const calculateDistance = true;
    const distances = 250;

    // if you do it by point
    const coords = [ latlng.lng, latlng.lat ];
    const coords2272 = proj4(projection4326, projection2272, [ coords[0], coords[1] ]);
    // console.log('coords:', coords, 'coords2272:', coords2272);

    // if you do it by parcel
    const parcelGeom = response.features[0].geometry;
    // console.log('parcelGeom:', parcelGeom);

    let polyCoords2272 = [];
    for (let polyCoord of parcelGeom.coordinates[0]) {
      let polyCoord2272 = proj4(projection4326, projection2272, [ polyCoord[0], polyCoord[1] ]);
      polyCoords2272.push(polyCoord2272);
    }

    let newGeometries = {
      "geometryType": "esriGeometryPolygon",
      "geometries": [{ "rings": [ polyCoords2272 ]}],
    };

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

    return axios.get(bufferUrl, { params })
      .then(bufferShapeSuccess)
      .catch(bufferShapeError);

  }

  bufferShapeSuccess(response) {
    // console.log('bufferShapeSuccess, response:', response);

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
    const buffer = L.polygon(latLngCoords);
    const map = store.state.map.map;

    // DEBUG
    store.commit('setBufferShape', latLngCoords);
    return buffer;
  }

  bufferShapeError(error) {
    // console.log('bufferShapeError:', error);
  }

  fetchBySpatialQuery(url, relationship, targetGeom, parameters = {}, calculateDistancePt, options = {}) {
    // console.log('bufferSearch fetch esri spatial query, url:', url, 'relationship:', relationship, 'targetGeom:', targetGeom, 'parameters:', parameters, 'options:', options, 'calculateDistancePt:', calculateDistancePt);
    const parcelLayer = [];

    let query;
    if (relationship === 'where') {
      query = Query({ url })[relationship](parameters.targetField + "='" + parameters.sourceValue + "'");
    } else {
      query = Query({ url })[relationship](targetGeom);
    }

    // apply options by chaining esri leaflet option methods
    const optionsKeys = Object.keys(options) || [];
    query = optionsKeys.reduce((acc, optionsKey) => {
      const optionsVal = options[optionsKey];
      let optionsMethod;

      try {
        acc = acc[optionsKey](optionsVal);
      } catch (e) {
        throw new Error(`esri-leaflet query task does not support option:
                         ${optionsKey}`);
      }

      return acc;
    }, query);

    return new Promise(function(resolve, reject) {
      query.run((function(error, featureCollection, response) {
        if (error) {
          reject(error);
        } else {
          // console.log('did get esri spatial query', response, error);

          let features = (featureCollection || {}).features;
          const status = error ? 'error' : 'success';

          // calculate distance
          if (calculateDistancePt) {
            const from = point(calculateDistancePt);

            features = features.map(feature => {
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
          resolve(response);
        }
      }));
    });
  }

}

export default BufferSearchClient;
