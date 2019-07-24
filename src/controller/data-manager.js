/*
The DataManager is responsible for fetching external data (mainly API responses)
and storing them in state.

The router should own an instance of DataManager and make calls to it based on
navigation events.
*/

import proj4 from 'proj4';
import axios from 'axios';
import explode from '@turf/explode';
import nearest from '@turf/nearest-point';


import * as L from 'leaflet';
import { query as Query } from 'esri-leaflet';
// import * as turf from '@turf/turf';
import { point, polygon, isNumber } from '@turf/helpers';
import distance from '@turf/distance';
import area from '@turf/area';
import {
  GeocodeClient,
  OwnerSearchClient,
  ShapeSearchClient,
  BufferSearchClient,
  ActiveSearchClient,
  CondoSearchClient,
  HttpClient,
  EsriClient
} from './clients';

class DataManager {
  constructor(opts) {
    const store = this.store = opts.store;
    const config = this.config = opts.config;
    const vueRouter = this.vueRouter = opts.router;
    // this.eventBus = opts.eventBus;
    this.controller = opts.controller;

    // create clients
    this.clients = {};

    // REVIEW do these need the store any more? or can they just pass the
    // response back to this?
    const clientOpts = { config, store, dataManager: this };
    this.clients.geocode = new GeocodeClient(clientOpts);
    this.clients.condoSearch = new CondoSearchClient(clientOpts);
    this.clients.ownerSearch = new OwnerSearchClient(clientOpts);
    this.clients.shapeSearch = new ShapeSearchClient(clientOpts);
    this.clients.bufferSearch = new BufferSearchClient(clientOpts);
    this.clients.activeSearch = new ActiveSearchClient(clientOpts);
    this.clients.http = new HttpClient(clientOpts);
    this.clients.esri = new EsriClient(clientOpts);
  }

  /* STATE HELPERS */


  /* DATA FETCHING METHODS */

  fetchRowData(){
    // console.log("Fetching row data")

    var state = this.store.state;
    let input = [];
    if (state.lastSearchMethod === 'owner search') {
      input = state.ownerSearch.data.filter(object => {
        return object._featureId === state.activeFeature.featureId
      });
    } else if (state.lastSearchMethod === 'shape search' || state.lastSearchMethod === 'buffer search') {
      input = state.shapeSearch.data.rows.filter(object => {
       return object._featureId === state.activeFeature.featureId
       });
    } else {
      let data;
      if (state.geocode.related != null && state.geocode.data._featureId != state.activeModal.featureId ) {
        let result = state.geocode.related.filter(object => object._featureId === state.activeFeature.featureId);
        data = result[0]
      } else {
        data = state.geocode.data;
      }
      input.push(data);
    }
    //console.log('fetchRowData is running, input:', input);
    this.clients.activeSearch.fetch(input[0]);
  }

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
    // console.log('INCREMENT - datamanager get 100 More was clicked, type', type, 'dataSource', dataSource, 'highestPageRetrieved', highestPageRetrieved);

    switch(type) {
      case 'http-get':
        // console.log('INCREMENT - http-get', dataSourceKey);
        this.clients.http.fetchMore(feature,
                                dataSource,
                                dataSourceKey,
                                highestPageRetrieved);
        break;
    }
  }

  didFetchMoreData(key, secondaryStatus, data) {
    //console.log('INCREMENT - DID FETCH More DATA:', key, secondaryStatus, data);

    const dataOrNull = status === 'error' ? null : data;
    let stateData = dataOrNull;

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key);
    }

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

    //console.log('nextPage', nextPage, 'setSourceDataOpts', setSourceDataOpts);
    // commit
    this.store.commit('setSourceDataMore', setSourceDataOpts);
    this.store.commit('setSecondarySourceStatus', setSecondarySourceStatusOpts);
  }

  defineTargets(dataSourceKey, targetsDef) {
    // console.log('defineTargets is running, dataSourceKey:', dataSourceKey, 'targetsDef:', targetsDef)
    const state = this.store.state;
    // targets may cause a looped axios call, or may just call one once and get multiple results
    let targetsFn = targetsDef.get;
    // let targetIdFn = targetsDef.getTargetId;

    if (typeof targetsFn !== 'function') {
      throw new Error(`Invalid targets getter for data source '${dataSourceKey}'`);
    }
    let targets = targetsFn(state);
    let targetIdFn = targetsDef.getTargetId;

    // console.log("Define Targets Starting", targets)
    // check if target objs exist in state.
    if ( typeof targets.length != 'undefined'){
      const targetIds = targets.map(targetIdFn);
    }
    // console.log("targetIds: ", targetIds)
    const stateTargets = state.sources[dataSourceKey].targets;
    const stateTargetIds = Object.keys(stateTargets);
    // console.log("stateTargetIds: ", stateTargetIds)
    // the inclusion check wasn't working because ids were strings in
    // one set and ints in another, so do this.
    const stateTargetIdsStr = stateTargetIds.map(String);
    let shouldCreateTargets;
    if (targetsDef.runOnce) {
      shouldCreateTargets = false;
    } else {
      shouldCreateTargets = !targetIds.every(targetId => {
        const targetIdStr = String(targetId);
        return stateTargetIdsStr.includes(targetIdStr);
      });
    }

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

    // this over-rides if the targets are set to "runOnce = true"
    if (targetsDef.runOnce) {
      let idsOfOwnersOrProps = "";
      for (let target of targets) {
        if(target.properties){
          idsOfOwnersOrProps = idsOfOwnersOrProps + "'" + target.properties.opa_account_num + "',";
        } else {
          idsOfOwnersOrProps = idsOfOwnersOrProps + "'" + target.parcel_number + "',";
        }
      }
      idsOfOwnersOrProps = idsOfOwnersOrProps.substring(0, idsOfOwnersOrProps.length - 1);
      targets = [idsOfOwnersOrProps];
    }
    // console.log("defineTargets targets: ", targets)
    return targets;
  }

  fetchData() {
    // console.log('\nFETCH DATA, this.store.state.lastSearchMethod:', this.store.state.lastSearchMethod, 'this.store.state.geocode:', this.store.state.geocode);
    // console.log('-----------');
    let geocodeObj;
    if( this.store.state.lastSearchMethod === 'geocode' && this.store.state.geocode.data.condo === true) {

      geocodeObj = this.store.state.condoUnits.units[Number(this.store.state.parcels.pwd.properties.PARCELID)][0];
      const ownerSearchObj = geocodeObj;

      if(this.store.state.shapeSearch.data != null) {
        let result = this.store.state.shapeSearch.data.rows.filter(
          a => a._featureId === this.store.state.activeCondo.featureId
        )
        const shapeSearchObj = this.store.state.condoUnits.units[result[0].pwd_parcel_id];
      }
    } else {
        geocodeObj = this.store.state.geocode.data;
        const ownerSearchObj = this.store.state.ownerSearch.data;
        if(this.store.state.shapeSearch.data) {const shapeSearchObj = this.store.state.shapeSearch.data.rows;}
    }


    let dataSources = this.config.dataSources || {};
    let dataSourceKeys = Object.entries(dataSources);

    for (let [dataSourceKey, dataSource] of dataSourceKeys) {
      const state = this.store.state;
      const type = dataSource.type;
      const targetsDef = dataSource.targets;

      // if the data sources specifies a features getter, use that to source
      // features for evaluating params/forming requests. otherwise,
      // default to the geocode result.
      let targets;
      let targetIdFn;
      let targetsFn;

      // targets may cause a looped axios call, or may just call one once and get multiple results
      // console.log("targetsDef: ", targetsDef)
      if (targetsDef) {
        targetsFn = targetsDef.get;
        // console.log("targetsFn: ", targetsFn)
        targetIdFn = targetsDef.getTargetId;
        targets = this.defineTargets(dataSourceKey, targetsDef);
      } else if (this.store.state.lastSearchMethod !== 'owner search') {
        targets = [geocodeObj];
      } else {
        targets = [ownerSearchObj][0];
      }

      for (let target of targets) {
        // get id of target
        let targetId;
        if (targetIdFn && !targetsDef.runOnce) {
          targetId = targetIdFn(target, state);
        }

        // check if it's ready
        const isReady = this.checkDataSourceReady(dataSourceKey, dataSource, targetId);
        if (!isReady) {
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

        // if it is set up to run a single axios call on a set of targets
        if (targetsDef) {
          if (targetsDef.runOnce) {
            targetIdFn = function(feature) {
              return feature.parcel_number;
            }
          }
        }

        // TODO do this for all targets
        switch(type) {
          case 'http-get':
            this.clients.http.fetch(target,
                                    dataSource,
                                    dataSourceKey,
                                    targetIdFn);
            break;

          case 'http-get-nearby':
            this.clients.http.fetchNearby(target,
                                          dataSource,
                                          dataSourceKey,
                                          targetIdFn);
            break;

          case 'esri':
            // TODO add targets id fn
            this.clients.esri.fetch(target, dataSource, dataSourceKey);

            break;
          case 'esri-nearby':
            // TODO add targets id fn
            this.clients.esri.fetchNearby(target, dataSource, dataSourceKey);
            break;

          default:
            throw `Unknown data source type: ${type}`;
            break;
        }  // end of switch
      }  // end of for targets loop
    } // end of for dataSource loop
  }

  didFetchData(key, status, data, targetId, targetIdFn) {

    // console.log('didFetchData is running, data:', data)
    const dataOrNull = status === 'error' ? null : data;
    let stateData = dataOrNull;
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

    // this might cause a problem for other dataSources
    if (targetIdFn) {
      this.turnToTargets(key, stateData, targetIdFn);
    }

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
    if (!targetIdFn) {
      this.store.commit('setSourceData', setSourceDataOpts);
    }
    this.store.commit('setSourceStatus', setSourceStatusOpts);

    // try fetching more data
    // console.log('didFetchData is calling fetchData again');
    this.fetchData();
  }

  // TODO - this is probably completely wasteful
  turnToTargets(key, stateData, targetIdFn) {
    let newLargeObj = { 'key': key }
    let newSmallObj = {}
    for (let theData of stateData) {
      newSmallObj[theData.parcel_number] = {
        'data': theData
      }
    }
    newLargeObj['data'] = newSmallObj;
    this.store.commit('setSourceDataObject', newLargeObj);
  }

  resetData() {
    // console.log('resetData is running');
    const dataSources = this.config.dataSources || {};

    for (let dataSourceKey of Object.keys(dataSources)) {
      const dataSource = dataSources[dataSourceKey];
      const targetsDef = dataSource.targets;

      // null out existing data in state
      if (targetsDef) {
        this.store.commit('clearSourceTargets', {
          key: dataSourceKey
        });
        if (targetsDef.runOnce) {
          this.store.commit('setSourceStatus', {
            key: dataSourceKey,
            status: null
          })
        }
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
    // console.log('resetGeocode is running');
    // reset geocode
    this.store.commit('setUnits', null);
    this.store.commit('setGeocodeStatus', null);
    this.store.commit('setGeocodeData', null);
    this.store.commit('setGeocodeRelated', null);
    this.store.commit('setGeocodeInput', null);

    // reset parcels
    // if (this.config.parcels) {
    //   this.store.commit('setParcelData', {
    //     parcelLayer: 'pwd',
    //     multipleAllowed: false,
    //     data: null
    //   });
    // }

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
      // console.log("targetObj: ", targetObj)
      // if the target obj has a status of null, this data source is ready.
      isReady = !targetObj.status;
    }

    // console.log('checkDataSourceReady isReady:', isReady);
    return isReady;
  }

  assignFeatureIds(features, dataSourceKey, topicId) {
    // console.log("assign feature Id's starting")
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
        // console.warn(e);
      }
      // console.log("_featureId = ", feature._featureId)
      featuresWithIds.push(feature);
    }

    // console.log(dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  }

  evaluateParams(feature, dataSource) {
    // console.log("evalutateParams data-manager feature:  ", feature)
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
  geocode(input) {
    //console.log('data-manager geocode is running, input:', input, 'this', this);
    const didTryGeocode = this.didTryGeocode.bind(this);
    // if (this.store.state.bufferMode) {
    //   const test = this.clients.bufferSearch.fetch(input).then(didTryGeocode);
    // } else {
    const test = this.clients.geocode.fetch(input).then(didTryGeocode);
    // }
  }

  didOwnerSearch() {
    console.log('didOwnerSearch is running, this.store.state.ownerSearch.status:', this.store.state.ownerSearch.status);
    if (this.store.state.ownerSearch.status === 'success') {
      this.store.commit('setLastSearchMethod', 'owner search');
      this.controller.router.didOwnerSearch();
      this.fetchData();
    } else {
      // this.store.commit('setOwnerSearchStatus', 'error');
    }
  }

  clearOwnerSearch(){
    // console.log('clearOwnerSearch is running');
    this.store.commit('setOwnerSearchStatus', null);
    this.store.commit('setOwnerSearchData', null);
    this.store.commit('setOwnerSearchInput', null);
  }

  didCondoSearch(){
    if (Object.keys(this.store.state.condoUnits.units).length) {
      console.log('didCondoSearch if is running')
      const feature = this.store.state.condoUnits.units[Number(this.store.state.parcels.pwd.properties.PARCELID)][0]
      const didGeocode = this.didGeocode.bind(this)
      didGeocode(feature)
    }
  }

  checkForShapeSearch(input) {
    console.log('checkForShapeSearch is running, input:', input)
    if(this.store.state.drawShape !== null ) {
      console.log('checkForShapeSearch - drawShape is not null');
      this.clearShapeSearch()
      const input = this.store.state.parcels.pwd;
      this.store.commit('setLastSearchMethod', 'shape search');
      const didShapeSearch = this.didShapeSearch.bind(this);
      this.resetGeocode();
      this.clearOwnerSearch()
      // console.log("Shape search input: ", input)
      return this.clients.shapeSearch.fetch(input).then(didShapeSearch);
    } else {
      console.log('checkForShapeSearch else is running - starting condo process');
      let input;
      if (this.store.state.parcels.pwd) {
        input = this.store.state.parcels.pwd.properties.ADDRESS;
      } else {
        input = this.store.state.geocode.input;
      }
      //console.log("Not shape search, input: ", input)
      this.clearShapeSearch()
      const didCondoSearch = this.didCondoSearch.bind(this)
      this.clients.condoSearch.fetch(input).then(didCondoSearch)

    }
  }

  didShapeSearch() {
    // console.log('didShapeSearch is running')
    this.controller.router.didShapeSearch();
    this.fetchData();
  }

  removeShape() {
    if(this.store.state.editableLayers !== null ){
      this.store.state.editableLayers.clearLayers();
    }
  }

  clearShapeSearch() {
    // console.log('clearShapeSearch is running');
    this.store.commit('setShapeSearchStatus', null);
    this.store.commit('setShapeSearchInput', null);
    this.store.commit('setShapeSearchData', null);
    this.store.commit('setUnits', null);
    // this.store.commit('setDrawShape', null);
    if(this.store.state.editableLayers !== null ){
      this.store.state.editableLayers.clearLayers();
    }
  }

  didTryGeocode(feature) {
    // console.log('didTryGeocode is running, this.vueRouter:', this.vueRouter, 'feature:', feature, 'this.store.state.geocode.status:', this.store.state.geocode.status, 'this.store.state.geocode.input:', this.store.state.geocode.input);

    this.resetData();
    // if (this.store.state.geocode.status === 'error') {
    if (this.store.state.geocode.status === 'error' && this.store.state.geocode.input === 'null') {
    // if (this.store.state.geocode.status === 'error' && typeof this.store.state.geocode.input === 'null') {
      // console.log('didTryGeocode is calling checkForShapeSearch at the top');
      this.checkForShapeSearch()

    } else if (this.store.state.geocode.status === 'success') {
      // console.log('didTryGeocode is running, this.store.state.geocode.status === success');
      // this.resetData();
      this.didGeocode(feature);

      // geocode status can be success even on reverseGeocode
      if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
        this.store.commit('setLastSearchMethod', 'geocode');
      }
      this.clearOwnerSearch()
      this.clearShapeSearch()

    // owner search
    } else if (this.store.state.geocode.status === "error" && this.store.state.geocode.input !== null) {
      // console.log('didTryGeocode is running, else if geocode.status = "error" && geocode.input !== null, geocode.input:', this.store.state.geocode.input)
      //Owner search
      // this.store.commit('setLastSearchMethod', 'owner search');

      if (this.store.state.editableLayers !== null) {
        this.store.state.editableLayers.clearLayers();
      }
      const input = this.store.state.geocode.input;
      // console.log("didTryGeocode input: ", input )

      const didOwnerSearch = this.didOwnerSearch.bind(this);
      const condoSearch = this.clients.condoSearch.fetch.bind(this.clients.condoSearch);
      const didGeocode = this.didGeocode.bind(this)
      this.resetGeocode();

      // Fail on owner search here takes you to the condo search process with the input
      return this.clients.ownerSearch.fetch(input).then( didOwnerSearch, () => condoSearch(input));

    // this is where it should be
    } else if (typeof feature === 'undefined') {
      // console.log('else if feature undefined is running')
      // This should be the default failure for geocode and shapeSearches that may have a condo
      const input =  this.store.state.parcels.pwd != null ? this.store.state.parcels.pwd : this.store.state.geocode.input
      //Check if this was a shapeSearch that may have other non-condo parcels to handle and add

      // console.log('didTryGeocode at the bottom is calling checkForShapeSearch');

      this.checkForShapeSearch(input)

      //Run condoSearch to find and handle condo buildings and add to the results
    } else {
      //console.log('Unknown misc didTryGeocode failure')
    }
  }

  didGeocode(feature) {
    // console.log('didGeocode is running, feature:', feature, 'this.store.state.lastSearchMethod:', this.store.state.lastSearchMethod);
    this.controller.router.didGeocode();
    // if (this.store.state.map) {
    //   // console.log('didGeocode is setting map stuff, feature:', feature)
    //   this.store.commit('setMapZoom', 19);
    //   this.store.commit('setMapCenter', feature.geometry.coordinates);
    // }

    if (this.store.state.bufferMode) {
      const latLng = {lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0]}
      this.getParcelsByBuffer(latLng, []);
    } else {
      if (feature) {
        if (feature.street_address) {
          return;
        } else if (feature.properties.street_address) {
          // console.log('didGeocode calling fetchData');
          this.fetchData();
        }
        if(feature.geometry.coordinates) {
          // console.log('if feature.geometry.coordinates is running');
          this.store.commit('setMapZoom', 19);
          this.store.commit('setMapCenter', feature.geometry.coordinates);
        }
      } else {
        // console.log('didGeocode calling fetchData');
        this.fetchData();
      }
    }


    if (this.store.state.lastSearchMethod === 'geocode') {
      const latLng = {lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0]}
      this.getParcelsByLatLng(latLng, 'pwd', null)
    }
  }

  getParcelsById(id, parcelLayer) {
    const url = this.config.map.featureLayers.pwdParcels.url;
    const configForParcelLayer = this.config.parcels[parcelLayer];
    const geocodeField = configForParcelLayer.geocodeField;
    const parcelQuery = Query({ url });
    parcelQuery.where(geocodeField + " IN (" + id + ")");
    let reponse = [];
    return parcelQuery.run((function(error, featureCollection, response) {
        this.didGetParcelsById(error, featureCollection, response, parcelLayer, fetch);
      }).bind(this)
    );
  }

  getParcelsByLatLng(latlng, parcelLayer, fetch, callback = () => {}) {
    // console.log('getParcelsByLatLng, latlng:', latlng, 'parcelLayer:', this.config.map.featureLayers, 'fetch:', fetch, 'this.config.map.featureLayers:', this.config.map.featureLayers);
    const latLng = L.latLng(latlng.lat, latlng.lng);
    const url = this.config.map.featureLayers.pwdParcels.url;
    const parcelQuery = Query({ url });
    // console.log(parcelQuery);
    parcelQuery.contains(latLng);

    parcelQuery.run((function(error, featureCollection, response) {
      // console.log('in getParcelsByLatLng, featureCollection:', featureCollection);
      this.didGetParcels(error, featureCollection, response, parcelLayer, fetch, callback);
    }).bind(this))

  }

  getParcelsByShape(latlng, parcelLayer) {

    // console.log('getParcelsByShape is running, latlng._latlngs:', latlng._latlngs, 'parcelLayer:', parcelLayer)

    const latLng = L.polygon(latlng._latlngs, latlng.options);
    const url = this.config.map.featureLayers.pwdParcels.url;

    const parcelQuery = Query({ url });
    parcelQuery.intersects(latLng);

    parcelQuery.run((function(error, featureCollection, response) {
        this.didGetParcelsByShape(error, featureCollection, response, parcelLayer, fetch);
      }).bind(this)
    );

  }

  getParcelsByBuffer(latlng, parcelLayer) {
    // console.log('getParcelsByBuffer is running, latlng:', latlng);
    const projection4326 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
    const projection2272 = "+proj=lcc +lat_1=40.96666666666667 +lat_2=39.93333333333333 +lat_0=39.33333333333334 +lon_0=-77.75 +x_0=600000 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs";

    const parcelUrl = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/PWD_PARCELS/FeatureServer/0';
    const geometryServerUrl = '//gis-utils.databridge.phila.gov/arcgis/rest/services/Utilities/Geometry/GeometryServer/';
    const calculateDistance = true;
    const distances = 320;

    // params.geometries = `[${feature.geometry.coordinates.join(', ')}]`
    // TODO get some of these values from map, etc.
    const coords = [latlng.lng, latlng.lat];
    const coords2272 = proj4(projection4326, projection2272, [coords[0], coords[1]]);
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
        // this.dataManager.didFetchData(dataSourceKey, 'error');
        return;
      }

      const latLngCoords = xyCoords.map(xyCoord => [...xyCoord].reverse());

      // get nearby features using buffer
      const buffer = L.polygon(latLngCoords);
      const map = this.store.state.map.map;

      // DEBUG
      // buffer.addTo(map);

      //this is a space holder
      const parameters = {};
      this.fetchBySpatialQuery(parcelUrl,
                               'within',
                               buffer,
                               parameters,
                               calculateDistance ? coords : null,
                               // options,
                              );
    }, response => {
        // console.log('getParcelsByBuffer error:', response);

        // this.dataManager.didFetchData(dataSourceKey, 'error');
    });
  }

  fetchBySpatialQuery(url, relationship, targetGeom, parameters = {}, calculateDistancePt, options = {}) {
    // console.log('fetch esri spatial query, url:', url, 'relationship:', relationship, 'targetGeom:', targetGeom, 'parameters:', parameters, 'options:', options, 'calculateDistancePt:', calculateDistancePt);
    const parcelLayer = []

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
            let polygonInstance = polygon([featureCoords[0]]);
            const vertices = explode(polygonInstance)
            const closestVertex = nearest(from, vertices);
            dist = distance(from, closestVertex, { units: 'miles' })
          } else {
            const to = point(featureCoords);
            dist = distance(from, to, { units: 'miles' });
          }

          // TODO make distance units an option. for now, just hard code to ft.
          const distFeet = parseInt(dist * 5280);
          // console.log('distFeet:', distFeet);

          feature._distance = distFeet;

          return feature;
        })
      }
      this.didGetParcelsByBuffer(error, featureCollection, response, parcelLayer, fetch);
      // this.dataManager.didFetchData(dataSourceKey, status, features);
    });
  }

  didGetParcels(error, featureCollection, response, parcelLayer, fetch, callback = () => {}) {
    // console.log('didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);
    const configForParcelLayer = this.config.parcels.pwd;
    const geocodeField = configForParcelLayer.geocodeField;
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    // const lastSearchMethod = this.store.state.lastSearchMethod;

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
    // console.log('featureCollection: ', featureCollection.features, 'features: ', features);
    if (features.length === 0) {
      return;
    }

    let lastSearchMethod;
    if (this.store.state.clickCoords) {
      this.store.commit('setLastSearchMethod', 'reverseGeocode');
      lastSearchMethod = 'reverseGeocode';
    } else {
      lastSearchMethod = this.store.state.lastSearchMethod;
    }
    let feature = features[0];
    let coords = feature.geometry.coordinates;
    // use turf to get area and perimeter of all parcels returned

    // console.log('feature:', feature, 'coords.length:', coords.length);
    if (coords.length > 1) {
      let distances = [];
      let areas = [];
      for (let coordsSet of coords) {
        //console.log('coordsSet:', coordsSet);
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
    // console.log("setParcelsInState: ", parcelLayer, feature);

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
      // console.log("id", id);
      // console.log('Line 701 data-manager.js didGetParcels - if shouldGeocode is running through router');
      if (id) this.controller.router.routeToAddress(id);
    } else {
      // console.log('180405 data-manager.js didGetParcels - if shouldGeocode is NOT running');
      // if (lastSearchMethod != 'reverseGeocode-secondAttempt') {
      // if (fetch !== 'noFetch') {
      if (fetch !== 'noFetch' && lastSearchMethod != 'reverseGeocode-secondAttempt' && this.store.state.bufferMode === false) {
        // console.log('180405 data-manager.js - didGetParcels - is calling fetchData() on feature w address', feature.properties.street_address);
        this.fetchData();
      }
    }
    callback()
  }

  didGetParcelsByBuffer(error, featureCollection, response, parcelLayer, fetch) {
    // console.log('didGetParcelsByBuffer, error:', error, 'featureCollection:', featureCollection, 'response:', response, 'parcelLayer:', parcelLayer, 'fetch:', fetch)

    const configForParcelLayer = this.config.parcels.pwd;
    const geocodeField = configForParcelLayer.geocodeField;
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      if (configForParcelLayer.clearStateOnError) {
      }
      return;
    }
    if (!featureCollection) {return;}

    const features = featureCollection.features;

    if (features.length === 0) {return;}
    // at this point there is definitely a feature or features - put it in state
    this.setParcelsInState(parcelLayer, features);
    // this.geocode(features);
    this.store.commit('setLastSearchMethod', 'buffer search');
    this.resetGeocode();
    this.store.state.bufferMode = false;
    const didShapeSearch = this.didShapeSearch.bind(this);
    this.clients.shapeSearch.fetch(features).then(didShapeSearch);
  }

  didGetParcelsByShape(error, featureCollection, response, parcelLayer, fetch) {
    // console.log('didGetParcelsByShape is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);

    const configForParcelLayer = this.config.parcels.pwd;
    const geocodeField = configForParcelLayer.geocodeField;
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    const lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      if (configForParcelLayer.clearStateOnError) {
      }
      return;
    }
    if (!featureCollection) {return;}

    const features = featureCollection.features;

    if (features.length === 0) {return;}
    // at this point there is definitely a feature or features - put it in state
    this.setParcelsInState(parcelLayer, features);
    // this.geocode(features);
    this.store.commit('setLastSearchMethod', 'shape search');
    this.removeShape();
    // this.clearShapeSearch()
    this.resetGeocode();
    const didShapeSearch = this.didShapeSearch.bind(this);
    this.clients.shapeSearch.fetch(features).then(didShapeSearch);
  }

  didGetParcelsById(error, featureCollection, response, parcelLayer, fetch) {

    // console.log('180405 didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);

    const configForParcelLayer = this.config.parcels.pwd;
    const geocodeField = configForParcelLayer.geocodeField;
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    const lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      if (configForParcelLayer.clearStateOnError) {
      }
      return;}
      if (!featureCollection) {return;}

      const features = featureCollection.features;

      if (features.length === 0) { return;}
      // at this point there is definitely a feature or features - put it in state
      this.setParcelsInState(parcelLayer, features);
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
