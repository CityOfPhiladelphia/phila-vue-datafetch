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
  ShapeSearchClient,
  ActiveSearchClient,
  CondoSearchClient,
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
    this.clients.condoSearch = new CondoSearchClient(clientOpts);
    this.clients.ownerSearch = new OwnerSearchClient(clientOpts);
    this.clients.shapeSearch = new ShapeSearchClient(clientOpts);
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
      } else if (state.lastSearchMethod === 'shape search') {
        input = state.shapeSearch.data.rows.filter(object => {
                     return object._featureId === state.activeFeature.featureId
                     });
      } else {
        input.push(state.geocode.data);
        for (let relate of state.geocode.related) {
          input.push(relate);
        }
      }
    this.clients.activeSearch.fetch(input[0])
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

  defineTargets(dataSourceKey, targetsDef) {
    console.log("Define Targets Starting")
    const state = this.store.state;
    // targets may cause a looped axios call, or may just call one once and get multiple results
    let targetsFn = targetsDef.get;
    // let targetIdFn = targetsDef.getTargetId;

    if (typeof targetsFn !== 'function') {
      throw new Error(`Invalid targets getter for data source '${dataSourceKey}'`);
    }
    let targets = targetsFn(state);
    let targetIdFn = targetsDef.getTargetId;

    // check if target objs exist in state.
    const targetIds = targets.map(targetIdFn);
    const stateTargets = state.sources[dataSourceKey].targets;
    const stateTargetIds = Object.keys(stateTargets);
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

    return targets;
  }

  fetchData() {
    console.log('\nFETCH DATA');
    console.log('-----------');

    const geocodeObj = this.store.state.geocode.data;
    const ownerSearchObj = this.store.state.ownerSearch.data;
    if(this.store.state.shapeSearch.data) {const shapeSearchObj = this.store.state.shapeSearch.data.rows;}

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
      console.log("targetsDef: ", targetsDef)
      if (targetsDef) {
        targetsFn = targetsDef.get;
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
    console.log("Did fetch data about to try fetching more data")
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
    console.log("evalutateParams data-manager feature:  ", feature)
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
    console.log('data-manager geocode is running, input:', input);
    const didTryGeocode = this.didTryGeocode.bind(this);
    const test = this.clients.geocode.fetch(input).then(didTryGeocode);
  }

  didOwnerSearch() {
    console.log("Did Owner Search")
    this.fetchData();
    console.log()
  }

  checkForShapeSearch() {
    console.log("Checking for shape search")
    if(this.store.state.drawShape !== null ) {
      this.store.commit('setLastSearchMethod', 'shape search');
      const input = this.store.state.parcels.pwd;
      const didShapeSearch = this.didShapeSearch.bind(this);
      this.store.commit('setOwnerSearchStatus', null);
      this.store.commit('setOwnerSearchData', null);
      this.store.commit('setOwnerSearchInput', null);
      this.resetGeocode();
      console.log("Shape search input: ", input)
      return this.clients.shapeSearch.fetch(input).then(didShapeSearch);
    }
  }

  didShapeSearch() {
    this.fetchData();
  }

  didTryGeocode(feature) {
    console.log('didTryGeocode is running, feature:', feature);
    console.log('this.store.state.geocode.status: ', this.store.state.geocode.status,
                'typeof this.store.state.geocode.input: ', typeof this.store.state.geocode.input);
    if (this.store.state.geocode.status === 'error' && typeof this.store.state.geocode.input === 'undefined') {
      console.log('didTryGeocode is running, error: need to reset drawShape ');
      //TODO set up drawShape so that after running it removes the shape, resetting the field
      // and instead shows the polygons of the parcels selected on the map
      //probably need some way to clear that too though for owner, click and address searches.

      this.checkForShapeSearch()

      console.log("Feature is undefined")

    } else if (this.store.state.geocode.status === 'success') {

      console.log('didTryGeocode is running, success');

      this.resetData();
      this.didGeocode(feature);
      this.store.commit('setLastSearchMethod', 'geocode');
      this.store.commit('setOwnerSearchStatus', null);
      this.store.commit('setOwnerSearchData', null);
      this.store.commit('setOwnerSearchInput', null);
      this.store.commit('setShapeSearchStatus', null);
      this.store.commit('setShapeSearchData', null);
      this.store.commit('setDrawShape', null);
      if(this.store.state.editableLayers !== null ){
        this.store.state.editableLayers.clearLayers();
      }
    } else if (this.store.state.geocode.status === null) {
      console.log('didTryGeocode is running, feature:', feature);
      this.store.commit('setLastSearchMethod', 'owner search');
      if(this.store.state.editableLayers !== null ){
        this.store.state.editableLayers.clearLayers();
      }
      this.store.commit('setDrawShape', null);
      this.store.commit('setShapeSearchStatus', null);
      this.store.commit('setShapeSearchData', null);

      const input = this.store.state.geocode.input;
      this.resetGeocode();
      return this.clients.shapeSearch.fetch(input);
    } else if (this.store.state.geocode.input != null) {
      //Owner search
      this.store.commit('setLastSearchMethod', 'owner search');

      if ( this.store.state.editableLayers !== null ) {
        this.store.state.editableLayers.clearLayers();
      }
      const input = this.store.state.geocode.input;
      console.log("didTryGeocode input: ", input )
      console.log("Line 573 - Running did owner search")
      const didOwnerSearch = this.didOwnerSearch.bind(this);
      const condoSearch = this.clients.condoSearch.fetch.bind(this.clients.condoSearch);
      const didGeocode = this.didGeocode.bind(this)
      this.resetGeocode();
      console.log("didTryGeocode input: ", input )

      // Fail on owner search here takes you to the condo search process with the input
      return this.clients.ownerSearch.fetch(input).then( () => didOwnerSearch, () => condoSearch(input).then(didGeocode));

    } else if (typeof feature === 'undefined' && this.store.state.ownerSearch.status != 'success') {
      // This should be the default failure for geocode and shapeSearches that may have a condo

      console.log(this.store.state.ownerSearch.status)
      console.log("Figure out the input type based on the search")
      const input =  this.store.state.parcels.pwd != null ? this.store.state.parcels.pwd : this.store.state.geocode.input
      console.log("Adding condo search client, input: ", input)

      //Check if this was a shapeSearch that may have other non-condo parcels to handle and add

      this.checkForShapeSearch()

      //Run condoSearch to find and handle condo buildings and add to the results
      this.clients.condoSearch.fetch(input)
    } else { console.log("Unknown misc didTryGeocode failure") }
  }

  didGeocode(feature) {
    console.log("did Geocode is running", this)
    this.controller.router.didGeocode();
    if (this.store.state.map) {
      this.store.commit('setMapZoom', 19);
      this.store.commit('setMapCenter', feature.geometry.coordinates);
    }

    if (feature) {
      if (feature.street_address) {
        return;
      } else if (feature.properties.street_address) {
        this.fetchData();
      }
      if(feature.geometry.coordinates) {
        this.store.commit('setMapCenter', feature.geometry.coordinates);
      }
    } else {
      this.fetchData();
    }
  } // end didGeocode

  getParcelsById(id, parcelLayer) {
    const url = this.config.map.featureLayers.pwdParcels.url;
    const configForParcelLayer = this.config.parcels[parcelLayer];
    const geocodeField = configForParcelLayer.geocodeField;
    const parcelQuery = Query({ url });
    parcelQuery.where(geocodeField + " IN (" + id + ")");
    let reponse = [];
    // parcelQuery.run((function(error, featureCollection, response) {
    //     console.log('171111 getParcelsById parcelQuery ran, response:', response);
    //     this.didGetParcels(error, featureCollection, response, parcelLayer);
    //   }).bind(this)
    // )

    return parcelQuery.run((function(error, featureCollection, response) {
        this.didGetParcelsById(error, featureCollection, response, parcelLayer, fetch);
      }).bind(this)
    );
  }

  getParcelsByLatLng(latlng, parcelLayer, fetch) {
    // console.log('getParcelsByLatLng, latlng:', latlng, 'parcelLayer:', this.config.map.featureLayers, 'fetch:', fetch, 'this.config.map.featureLayers:', this.config.map.featureLayers);
    const latLng = L.latLng(latlng.lat, latlng.lng);
    const url = this.config.map.featureLayers.pwdParcels.url;
    const parcelQuery = Query({ url });
    // console.log(parcelQuery);
    parcelQuery.contains(latLng);
    // console.log("parcelQuery.contains(latLng)", parcelQuery.contains(latLng));
    const test = 5;
    parcelQuery.run((function(error, featureCollection, response) {
        this.didGetParcels(error, featureCollection, response, parcelLayer, fetch);
      }).bind(this)
    )
  }

  getParcelsByShape(latlng, parcelLayer) {

    // console.log("Testing DrawnShape Geocoder", latlng._latlngs)

    const latLng = L.polygon(latlng._latlngs, latlng.options);
    const url = this.config.map.featureLayers.pwdParcels.url;

    const parcelQuery = Query({ url });
    parcelQuery.intersects(latLng);

    parcelQuery.run((function(error, featureCollection, response) {
        this.didGetParcelsByShape(error, featureCollection, response, parcelLayer, fetch);
      }).bind(this)
    );

  }

  didGetParcels(error, featureCollection, response, parcelLayer, fetch) {
    console.log('180405 didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);
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
    // console.log('featureCollection: ', featureCollection.features, 'features: ', features);
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
        console.log('coordsSet:', coordsSet);
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
      if (fetch !== 'noFetch' && lastSearchMethod != 'reverseGeocode-secondAttempt') {
        // console.log('180405 data-manager.js - didGetParcels - is calling fetchData() on feature w address', feature.properties.street_address);
        this.fetchData();
      }
    }
  }

  didGetParcelsByShape(error, featureCollection, response, parcelLayer, fetch) {

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
      this.geocode(features);
      console.log("Ending did get parcels by shape after this.geocode()")

      // this.fetchData();
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
