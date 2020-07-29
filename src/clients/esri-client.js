import axios from 'axios';
import utils from '../utils.js';

// import * as turf from '@turf/turf';
// import { point, polygon, distance, explode, nearest-point } from '@turf/turf';
// import distance from '@turf/turf';
import { point, polygon, lineString } from '@turf/helpers';
import distance from '@turf/distance';
import explode from '@turf/explode';
import nearest from '@turf/nearest-point';

import proj4 from 'proj4';
import * as L from 'leaflet';
import { query as Query } from 'esri-leaflet';
import BaseClient from './base-client';

class EsriClient extends BaseClient {
  async fetch(feature, dataSource, dataSourceKey) {
    // console.log('esriclient fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey);

    const url = dataSource.url;
    const { relationship, targetGeometry, ...options } = dataSource.options;
    const parameters = dataSource.parameters;
    if (parameters) {
      if (feature) {
        parameters['sourceValue'] = feature.properties[parameters.sourceField];
      }
    }

    // check if a target geometry fn was specified. otherwise, use geocode feat
    let geom;
    if (targetGeometry) {
      const state = this.store.state;
      // pass leaflet to the targetgeom function so it can construct a custom
      // geometry (such as the lat lng bounds of a set of parcels) if it needs
      // to. use case: fetching regmaps.
      geom = targetGeometry(state, L);
    } else if (feature) {
      geom = feature.geometry;
    } else {
      geom = null;
    }

    if (dataSource.dependent) {
      if (dataSource.dependent !== 'none') {
        // handle null geom
        if (!geom) {
          this.dataManager.didFetchData(dataSourceKey, 'error');
          return;
        }
      }
    } else {
      // handle null geom
      if (!geom) {
        this.dataManager.didFetchData(dataSourceKey, 'error');
        return;
      }
    }

    this.fetchBySpatialQuery(dataSourceKey, url, relationship, geom, parameters, options);
  }

  fetchNearby(feature, dataSource, dataSourceKey) {
    // console.log('esri fetchNearby running, dataSource:', dataSource, 'dataSourceKey:', dataSourceKey);
    const projection4326 = utils.projection4326;
    const projection2272 = utils.projection2272;

    const dataSourceUrl = dataSource.url;
    const {
      calculateDistance,
      geometryServerUrl,
      distances,
      ...options
    } = dataSource.options;

    // console.log('distances:', distances)

    // params.geometries = `[${feature.geometry.coordinates.join(', ')}]`
    // TODO get some of these values from map, etc.
    const coords = feature.geometry.coordinates;
    const coords2272 = proj4(projection4326, projection2272, [ coords[0], coords[1] ]);
    // console.log('coords:', coords, 'coords2272:', coords2272);
    const params = {
      // geometries: feature => '[' + feature.geometry.coordinates[0] + ', ' + feature.geometry.coordinates[1] + ']',
      geometries: `[${coords2272.join(', ')}]`,
      inSR: 2272,
      outSR: 4326,
      bufferSR: 2272,
      distances: distances, //|| 0.0028,
      // inSR: 4326,
      // outSR: 4326,
      // bufferSR: 4326,
      // distances: distances, //|| 0.0028,
      unionResults: true,
      geodesic: false,
      f: 'json',
    };
    // console.log('esri nearby params', params);

    // get buffer polygon
    const bufferUrl = geometryServerUrl.replace(/\/$/, '') + '/buffer';
    // console.log('bufferUrl:', bufferUrl);

    axios.get(bufferUrl, { params }).then(response => {
      const data = response.data;
      // console.log('axios in esri fetchNearby is running, data:', data);

      // console.log('did get esri nearby buffer', data);

      const geoms = data.geometries || [];
      const geom = geoms[0] || {};
      const rings = geom.rings || [];
      const xyCoords = rings[0];

      // check for xy coords
      if (!xyCoords) {
        // we can't do anything without coords, so bail out
        this.dataManager.didFetchData(dataSourceKey, 'error');
        return;
      }

      const latLngCoords = xyCoords.map(xyCoord => [ ...xyCoord ].reverse());

      // get nearby features using buffer
      const buffer = L.polygon(latLngCoords);
      // const map = this.dataManager.store.state.map.map;

      // DEBUG
      // buffer.addTo(map);

      //this is a space holder
      const parameters = {};
      // console.log('about to call fetchBySpatialQuery');
      this.fetchBySpatialQuery(dataSourceKey,
        dataSourceUrl,
        'within',
        buffer,
        parameters,
        options,
        calculateDistance ? coords : null,
      );
    }, response => {
      // console.log('did fetch esri nearby error', response);

      this.dataManager.didFetchData(dataSourceKey, 'error');
    });
  }

  fetchBySpatialQuery(dataSourceKey, url, relationship, targetGeom, parameters = {}, options = {}, calculateDistancePt) {
    // console.log('fetch esri spatial query, dataSourceKey:', dataSourceKey, 'url:', url, 'relationship:', relationship, 'targetGeom:', targetGeom, 'parameters:', parameters, 'typeof(parameters.sourceValue):', typeof(parameters.sourceValue), 'options:', options, 'calculateDistancePt:', calculateDistancePt);

    let query;
    if (relationship === 'where') {
      if (typeof(parameters.sourceValue) === 'number') {
        query = Query({ url })[relationship](parameters.targetField + "=" + parameters.sourceValue);
      } else {
        query = Query({ url })[relationship](parameters.targetField + "='" + parameters.sourceValue + "'");
      }
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

    query.run((error, featureCollection, response) => {
      // console.log('did get esri spatial query', response, error);

      let features = (featureCollection || {}).features;
      const status = error ? 'error' : 'success';

      // calculate distance
      if (calculateDistancePt) {
        const from = point(calculateDistancePt);

        features = features.map(feature => {
          const featureCoords = feature.geometry.coordinates;
          // console.log('featureCoords:', featureCoords);
          let dist;
          if (Array.isArray(featureCoords[0])) {
            // console.log('feature:', feature, 'featureCoords[0]:', featureCoords[0]);
            let instance;
            if (feature.geometry.type === 'LineString') {
              instance = lineString([ featureCoords[0], featureCoords[1] ], { name: 'line 1' });
            } else {
              instance = polygon([ featureCoords[0] ]);
            }
            const vertices = explode(instance);
            const closestVertex = nearest(from, vertices);
            dist = distance(from, closestVertex, { units: 'miles' });
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

      this.dataManager.didFetchData(dataSourceKey, status, features);
    });
  }

}

export default EsriClient;
