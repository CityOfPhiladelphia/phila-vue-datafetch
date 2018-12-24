/*
The DataManager is responsible for fetching external data (mainly API responses)
and storing them in state.

The router should own an instance of DataManager and make calls to it based on
navigation events.
*/
import * as L from 'leaflet';
import { query as Query } from 'esri-leaflet';
// import * as turf from '@turf/turf';
import { point, polygon } from '@turf/helpers';
import distance from '@turf/distance';
import area from '@turf/area';
import {
  GeocodeClient,
  OwnerSearchClient,
  HttpClient,
  EsriClient
} from './clients';

class DataManager {
  constructor(opts) {
    const store = this.store = opts.store;
    const config = this.config = opts.config;
    // this.eventBus = opts.eventBus;
    this.controller = opts.controller;

    // create clients
    this.clients = {};

    // REVIEW do these need the store any more? or can they just pass the
    // response back to this?
    const clientOpts = { config, store, dataManager: this };
    this.clients.geocode = new GeocodeClient(clientOpts);
    this.clients.ownerSearch = new OwnerSearchClient(clientOpts);
    this.clients.http = new HttpClient(clientOpts);
    this.clients.esri = new EsriClient(clientOpts);
  }

  /* STATE HELPERS */

  // REVIEW maybe the getXXXParcelsById methods should just take an argument

  activeTopicConfig() {
    const key = this.store.state.activeTopic;
    let config;

    // if no active topic, return null
    if (key) {
      config = this.config.topics.filter((topic) => {
        return topic.key === key;
      })[0];
    }

    return config || {};
  }

  /* DATA FETCHING METHODS */

  fetchMoreData(dataSourceKey, highestPageRetrieved) {
    const feature = this.store.state.geocode.data;
    const dataSource = this.config.dataSources[dataSourceKey];

    const state = this.store.state;
    const type = dataSource.type;

    // update secondary status to `waiting`
    const setSecondarySourceStatusOpts = {
      key: dataSourceKey,
      secondaryStatus: 'waiting'
    };
    this.store.commit('setSecondarySourceStatus', setSecondarySourceStatusOpts);
    console.log('INCREMENT - datamanager get 100 More was clicked, type', type, 'dataSource', dataSource, 'highestPageRetrieved', highestPageRetrieved);

    switch(type) {
      case 'http-get':
        console.log('INCREMENT - http-get', dataSourceKey);
        this.clients.http.fetchMore(feature,
                                dataSource,
                                dataSourceKey,
                                highestPageRetrieved);
        break;
    }
  }

  didFetchMoreData(key, secondaryStatus, data) {
    console.log('INCREMENT - DID FETCH More DATA:', key, secondaryStatus, data);

    const dataOrNull = status === 'error' ? null : data;
    let stateData = dataOrNull;

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key);
    }

    // console.log('stateData', stateData);
    const nextPage = this.store.state.sources[key].data.page + 1;

    // put data in state
    const setSourceDataOpts = {
      key,
      data: stateData,
      page: nextPage
    };
    const setSecondarySourceStatusOpts = {
      key,
      secondaryStatus
    };

    console.log('nextPage', nextPage, 'setSourceDataOpts', setSourceDataOpts);
    // commit
    this.store.commit('setSourceDataMore', setSourceDataOpts);
    this.store.commit('setSecondarySourceStatus', setSecondarySourceStatusOpts);
  }


  fetchData() {
    // console.log('\nFETCH DATA');
    // console.log('-----------');

    const geocodeObj = this.store.state.geocode.data;

    // we always need a good geocode before we can get data, so return
    // if we don't have one yet.
    // if (!geocodeObj) {
    //   // console.log('fetch data but no geocode yet, returning');
    //   return;
    // }

    let dataSources = this.config.dataSources || {};
    let dataSourceKeys = Object.entries(dataSources);
    // console.log('in fetchData, dataSources before filter:', dataSources, 'dataSourceKeys:', dataSourceKeys);

    if (!geocodeObj) {
      dataSourceKeys = dataSourceKeys.filter(dataSourceKey => {
        if (dataSourceKey[1].dependent) {
          if (dataSourceKey[1].dependent === 'parcel') {
            return true;
          }
        }
      })
    }
    // console.log('in fetchData, dataSources after filter:', dataSources);

    // get "ready" data sources (ones whose deps have been met)
    // for (let [dataSourceKey, dataSource] of Object.entries(dataSources)) {
    for (let [dataSourceKey, dataSource] of dataSourceKeys) {
      const state = this.store.state;
      const type = dataSource.type;
      const targetsDef = dataSource.targets;

      // console.log('key:', dataSourceKey, type);

      // if the data sources specifies a features getter, use that to source
      // features for evaluating params/forming requests. otherwise,
      // default to the geocode result.
      let targets;
      let targetIdFn;
      let targetsFn;

      if (targetsDef) {
        targetsFn = targetsDef.get;
        targetIdFn = targetsDef.getTargetId;

        if (typeof targetsFn !== 'function') {
          throw new Error(`Invalid targets getter for data source '${dataSourceKey}'`);
        }
        targets = targetsFn(state);

        // check if target objs exist in state.
        const targetIds = targets.map(targetIdFn);
        const stateTargets = state.sources[dataSourceKey].targets;
        const stateTargetIds = Object.keys(stateTargets);
        // the inclusion check wasn't working because ids were strings in
        // one set and ints in another, so do this.
        const stateTargetIdsStr = stateTargetIds.map(String);
        const shouldCreateTargets = !targetIds.every(targetId => {
          const targetIdStr = String(targetId);
          return stateTargetIdsStr.includes(targetIdStr);
        });

        // if not, create them.
        if (shouldCreateTargets) {
          // console.log('should create targets', targetIds, stateTargetIds);
          this.store.commit('createEmptySourceTargets', {
            key: dataSourceKey,
            targetIds
          });
        }

        if (!Array.isArray(targets)) {
          throw new Error('Data source targets getter should return an array');
        }
      } else {
        targets = [geocodeObj];
      }

      // console.log('in fetchData, dataSourceKey:', dataSourceKey, 'targets:', targets);

      for (let target of targets) {
        // get id of target
        let targetId;
        if (targetIdFn) {
          targetId = targetIdFn(target);
        }

        // targetId && console.log('target:', targetId);

        // check if it's ready
        const isReady = this.checkDataSourceReady(dataSourceKey, dataSource, targetId);
        if (!isReady) {
          // console.log('not ready');
          continue;
        }

        // update status to `waiting`
        const setSourceStatusOpts = {
          key: dataSourceKey,
          status: 'waiting'
        };
        if (targetId) {
          setSourceStatusOpts.targetId = targetId;
        }
        this.store.commit('setSourceStatus', setSourceStatusOpts);

        // TODO do this for all targets
        switch(type) {
          case 'http-get':
            // console.log('http-get, target:', target, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn);
            this.clients.http.fetch(target,
                                    dataSource,
                                    dataSourceKey,
                                    targetIdFn);
            break;

          case 'http-get-nearby':
          // console.log('http-get-nearby', dataSourceKey, targetIdFn)
            this.clients.http.fetchNearby(target,
                                          dataSource,
                                          dataSourceKey,
                                          targetIdFn);
            break;

          case 'esri':
            // console.log('esri', dataSourceKey)
            // TODO add targets id fn
            this.clients.esri.fetch(target, dataSource, dataSourceKey);
            break;

            break;
          case 'esri-nearby':
            // console.log('esri-nearby', dataSourceKey)
            // TODO add targets id fn
            this.clients.esri.fetchNearby(target, dataSource, dataSourceKey);
            break;

          default:
            throw `Unknown data source type: ${type}`;
            break;
        }  // end of switch
      }  // end of for targets loop
      // console.log('end of targets loop for', dataSourceKey);
    } // end of for dataSource loop
    // console.log('end of outer loop');
  }

  didFetchData(key, status, data, targetId) {

    const dataOrNull = status === 'error' ? null : data;
    let stateData = dataOrNull;
    // console.log('data-manager DID FETCH DATA:', key, targetId || '', data);
    let rows;
    if (stateData) {
      rows = stateData.rows;
    }

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key, targetId);
    } else if (stateData) {
      stateData.rows = this.assignFeatureIds(rows, key, targetId);
    }

    // does this data source have targets?
    // const targets = this.config.dataSources[key].targets;

    // put data in state
    const setSourceDataOpts = {
      key,
      data: stateData,
    };
    const setSourceStatusOpts = {
      key,
      status
    };
    if (targetId) {
      setSourceDataOpts.targetId = targetId;
      setSourceStatusOpts.targetId = targetId;
    }

    // commit
    this.store.commit('setSourceData', setSourceDataOpts);
    this.store.commit('setSourceStatus', setSourceStatusOpts);

    // try fetching more data
    // console.log('171111 data-manager.js line 319 - didFetchData - is calling fetchData on targetId', targetId, 'key', key);
    this.fetchData();
  }

  resetData() {
      const dataSources = this.config.dataSources || {};

      for (let dataSourceKey of Object.keys(dataSources)) {
        const dataSource = dataSources[dataSourceKey];
        const targetsDef = dataSource.targets;

        // null out existing data in state
        if (targetsDef) {
          this.store.commit('clearSourceTargets', {
            key: dataSourceKey
          });
        } else {
          this.store.commit('setSourceData', {
            key: dataSourceKey,
            data: null
          })
          this.store.commit('setSourceStatus', {
            key: dataSourceKey,
            status: null
          })
        }
      }
    }

    // this gets called when the current geocoded address is wiped out, such as
    // when you click on the "Atlas" title and it navigates to an empty hash
    resetGeocode() {
      console.log('resetGeocode is running');
      // reset geocode
      this.store.commit('setGeocodeStatus', null);
      this.store.commit('setGeocodeData', null);
      this.store.commit('setGeocodeRelated', null);
      this.store.commit('setGeocodeInput', null);

      // reset parcels
      if (this.config.parcels) {
        this.store.commit('setParcelData');
        this.store.commit('parcel');
      }

      // reset other topic and map state
      if (this.config.topics.length) {
        if (this.config.defaultTopic || this.config.defaultTopic === null) {
          this.store.commit('setActiveTopic', this.config.defaultTopic);
        } else {
          // console.log('about to setActiveTopic, config:', this.config.topics[0].key);
          this.store.commit('setActiveTopic', this.config.topics[0].key);
        }
      }


      if (this.store.state.map) {
        this.store.commit('setBasemap', 'pwd');
      }

      // reset data sources
      if (this.store.state.sources) {
        this.resetData();
      }
    }

  checkDataSourcesFetched(paths = []) {
    // console.log('check data sources fetched', paths);

    const state = this.store.state;

    return paths.every(path => {
      // deps can be deep keys split on periods to get
      // a sequence of keys.
      const pathKeys = path.split('.');

      // traverse state to get the parent of the data object we need to
      // check.
      const stateObj = pathKeys.reduce((acc, pathKey) => {
        return acc[pathKey];
      }, state);

      return stateObj.status === 'success';
    });
  }

  checkDataSourceReady(key, options, targetId) {
    // console.log(`check data source ready: ${key} ${targetId || ''}`, options);

    const deps = options.deps;
    // console.log('deps', deps);
    const depsMet = this.checkDataSourcesFetched(deps);
    // console.log('depsMet', depsMet);
    let isReady = false;

    // if data deps have been met
    if (depsMet) {
      // get the target obj
      let targetObj = this.store.state.sources[key];
      if (targetId) {
        targetObj = targetObj.targets[targetId];
      }

      // if the target obj has a status of null, this data source is ready.
      isReady = !targetObj.status;
    }

    // console.log('checkDataSourceReady isReady:', isReady);
    return isReady;
  }

  assignFeatureIds(features, dataSourceKey, topicId) {
    if (!features) {
      return;
    }
    const featuresWithIds = [];

    // REVIEW this was not working with Array.map for some reason
    // it was returning an object when fetchJson was used
    // that is now converted to an array in fetchJson
    for (let i = 0; i < features.length; i++) {
      const suffix = (topicId ? topicId + '-' : '') + i;
      const id = `feat-${dataSourceKey}-${suffix}`;
      const feature = features[i];
      // console.log(dataSourceKey, feature);
      try {
        feature._featureId = id;
      }
      catch (e) {
        console.warn(e);
      }
      featuresWithIds.push(feature);
    }

    // console.log(dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  }

  evaluateParams(feature, dataSource) {
    const params = {};
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [key, valOrGetter] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        val = valOrGetter(feature, state);
      } else {
        val = valOrGetter;
      }

      params[key] = val;
    }

    return params;
  }

  /* GEOCODING */
  geocode(input, category) {
    // console.log('data-manager geocode is running, input:', input, 'category:', category);
    if (category === 'address') {
      const didGeocode = this.didGeocode.bind(this);
      return this.clients.geocode.fetch(input).then(didGeocode);
    } else if (category === 'owner') {
      // console.log('category is owner');
      const didOwnerSearch = this.didOwnerSearch.bind(this);
      return this.clients.ownerSearch.fetch(input).then(didOwnerSearch);
    } else if (category == null) {
      // console.log('no category');
      const didTryGeocode = this.didTryGeocode.bind(this);
      const test = this.clients.geocode.fetch(input).then(didTryGeocode);
    }
  }

  didOwnerSearch() {
    console.log('callback from owner search is running');
  }

  didTryGeocode(feature) {
    // console.log('didTryGeocode is running, feature:', feature);
    if (this.store.state.geocode.status === 'error') {
      const input = this.store.state.geocode.input;
      const didOwnerSearch = this.didOwnerSearch.bind(this);
      return this.clients.ownerSearch.fetch(input).then(didOwnerSearch);
    } else if (this.store.state.geocode.status === 'success') {
      this.didGeocode(feature);
      this.store.commit('setOwnerSearchStatus', null);
      this.store.commit('setOwnerSearchData', null);
      this.store.commit('setOwnerSearchInput', null);
    }
  }

  didGeocode(feature) {
    // console.log('DataManager.didGeocode:', feature);
    this.controller.router.didGeocode();
    if (!this.config.parcels) {
      if (this.store.state.map) {
        this.store.commit('setMapZoom', 19);
        this.store.commit('setMapCenter', feature.geometry.coordinates);
      }
      return
    }

    if (feature) {
      if (feature.street_address) {
        return;
      } else if (feature.properties.street_address) {
        this.fetchData();
      }
    } else {
      this.fetchData();
    }
  } // end didGeocode

  getParcelsById(id, parcelLayer) {
    // console.log('getParcelsById', parcelLayer);
    const url = this.config.map.featureLayers.pwdParcels.url;
    const configForParcelLayer = this.config.parcels[parcelLayer];
    const geocodeField = configForParcelLayer.geocodeField;
    const parcelQuery = Query({ url });
    parcelQuery.where(geocodeField + " = '" + id + "'");
    // console.log('parcelQuery:', parcelQuery);
    parcelQuery.run((function(error, featureCollection, response) {
        // console.log('171111 getParcelsById parcelQuery ran, response:', response);
        this.didGetParcels(error, featureCollection, response, parcelLayer);
      }).bind(this)
    )
  }

  getParcelsByLatLng(latlng, parcelLayer, fetch) {
    // console.log('getParcelsByLatLng, latlng:', latlng, 'parcelLayer:', this.config.map.featureLayers, 'fetch:', fetch, 'this.config.map.featureLayers:', this.config.map.featureLayers);
    const latLng = L.latLng(latlng.lat, latlng.lng);
    const url = this.config.map.featureLayers.pwdParcels.url;
    const parcelQuery = Query({ url });
    parcelQuery.contains(latLng);
    const test = 5;
    parcelQuery.run((function(error, featureCollection, response) {
        this.didGetParcels(error, featureCollection, response, parcelLayer, fetch);
      }).bind(this)
    )
  }

  didGetParcels(error, featureCollection, response, parcelLayer, fetch) {
    // console.log('180405 didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);
    const configForParcelLayer = this.config.parcels.pwd;
    const geocodeField = configForParcelLayer.geocodeField;
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    const lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      // update state
      if (configForParcelLayer.clearStateOnError) {
      // this.store.commit('setParcelData', { parcelLayer, [] });
      // this.store.commit('setParcelStatus', { parcelLayer }, 'error' });
      }
      return;
    }

    if (!featureCollection) {
      return;
    }

    const features = featureCollection.features;
    if (features.length === 0) {
      return;
    }

    let feature = features[0];
    let coords = feature.geometry.coordinates;
    // use turf to get area and perimeter of all parcels returned

    // console.log('feature:', feature, 'coords.length:', coords.length);
    if (coords.length > 1) {
      let distances = [];
      let areas = [];
      for (let coordsSet of coords) {
        // console.log('coordsSet:', coordsSet);
        const turfPolygon = polygon(coordsSet);
        distances.push(this.getDistances(coordsSet).reduce(function(acc, val) { return acc + val; }));
        areas.push(area(turfPolygon) * 10.7639);
      }
      feature.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
      feature.properties.TURF_AREA = areas.reduce(function(acc, val) { return acc + val; });
    } else {
      // console.log('coords:', coords);
      const turfPolygon = polygon(coords);
      let distances = this.getDistances(coords);
      feature.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
      feature.properties.TURF_AREA = area(turfPolygon) * 10.7639;
    }
    // console.log('after calcs, feature:', feature);

    // at this point there is definitely a feature or features - put it in state
    this.setParcelsInState(parcelLayer, feature);

    // shouldGeocode - true only if:
    // 1. didGetParcels is running because the map was clicked (lastSearchMethod = reverseGeocode)
    const shouldGeocode = (
      lastSearchMethod === 'reverseGeocode'
    );

    // console.log('didGetParcels - shouldGeocode is', shouldGeocode);
    if (shouldGeocode) {
      // since we definitely have a new parcel, and will attempt to geocode it:
      // 1. wipe out state data on other parcels
      // 2. attempt to replace
      // if (lastSearchMethod === 'reverseGeocode') { // || !configForParcelLayer.wipeOutOtherParcelsOnReverseGeocodeOnly) {
      const clickCoords = this.store.state.clickCoords;
      const coords = [clickCoords.lng, clickCoords.lat];
      const [lng, lat] = coords;
      const latlng = L.latLng(lat, lng);
      const props = feature.properties || {};
      const id = props[geocodeField];
      if (id) this.controller.router.routeToAddress(id);
    } else {
      // console.log('180405 data-manager.js didGetParcels - if shouldGeocode is NOT running');
      // if (lastSearchMethod != 'reverseGeocode-secondAttempt') {
      // if (fetch !== 'noFetch') {
      if (fetch !== 'noFetch' && lastSearchMethod != 'reverseGeocode-secondAttempt') {
        // console.log('180405 data-manager.js - didGetParcels - is calling fetchData() on feature w address', feature.properties.street_address);
        this.fetchData();
      }
    }
  }

  getDistances(coords) {
    let turfCoordinates = []
    for (let coordinate of coords[0]) {
      turfCoordinates.push(point(coordinate));
    }
    let distances = [];
    for (let i=0; i<turfCoordinates.length - 1; i++) {
      distances[i] = distance(turfCoordinates[i], turfCoordinates[i+1], {units: 'feet'});
    }
    return distances;
  }

  setParcelsInState(parcelLayer, feature) {
    let payload;
    // pwd

    payload = {
      parcelLayer,
      data: feature
    }

    // update state
    this.store.commit('setParcelData', payload);
  }
}

export default DataManager;
