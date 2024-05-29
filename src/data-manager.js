/*
The DataManager is responsible for fetching external data (mainly API responses)
and storing them in state.

The router should own an instance of DataManager and make calls to it based on
navigation events.
*/

import proj4 from 'proj4';
import axios from 'axios';
import { point, polygon, lineString } from '@turf/helpers';
import explode from '@turf/explode';
import nearest from '@turf/nearest-point';

import utils from './utils.js';
import {
  GeocodeClient,
  ActiveSearchClient,
  OwnerSearchClient,
  BlockSearchClient,
  HttpClient,
  EsriClient,
  CondoSearchClient,
  AirtableClient,
  AgoTokenClient,
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
    this.clients.activeSearch = new ActiveSearchClient(clientOpts);
    this.clients.ownerSearch = new OwnerSearchClient(clientOpts);
    this.clients.blockSearch = new BlockSearchClient(clientOpts);
    this.clients.http = new HttpClient(clientOpts);
    this.clients.esri = new EsriClient(clientOpts);
    this.clients.condoSearch = new CondoSearchClient(clientOpts);
    this.clients.airtable = new AirtableClient(clientOpts);
    this.clients.agoToken = new AgoTokenClient(clientOpts);
  }

  /* STATE HELPERS */

  // REVIEW maybe the getXXXParcelsById methods should just take an argument
  // activeParcelLayer? that's the only reason these are in here.

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

  fetchRowData(){
    // console.log("Fetching row data");

    var state = this.store.state;
    let input = [];
    if (state.lastSearchMethod === 'owner search' ||state.lastSearchMethod === 'block search') {
      let searchType = state.lastSearchMethod === 'owner search'? 'ownerSearch' : 'blockSearch';
      if (state[searchType].data) {
        input = state[searchType].data.filter(object => {
          return object._featureId === state.activeFeature.featureId;
        });
      }
    } else if (state.lastSearchMethod === 'shape search' || state.lastSearchMethod === 'buffer search') {
      console.log('state.shapeSearch.data:', state.shapeSearch.data);
      if (state.shapeSearch.data) {
        input = state.shapeSearch.data.rows.filter(object => {
          return object._featureId === state.activeFeature.featureId;
        });
      }
    } else {
      let data;
      if (state.geocode.related != null && state.geocode.data._featureId != state.activeModal.featureId ) {
        let result = state.geocode.related.filter(object => object._featureId === state.activeFeature.featureId);
        data = result[0];
      } else {
        data = state.geocode.data;
      }
      input.push(data);
    }
    //console.log('fetchRowData is running, input:', input);
    this.clients.activeSearch.fetch(input[0]);
  }

  fetchMoreData(dataSourceKey, highestPageRetrieved) {
    // console.log('data-manager.js fetchMoreData is running');
    const feature = this.store.state.geocode.data;
    const dataSource = this.config.dataSources[dataSourceKey];

    const state = this.store.state;
    const type = dataSource.type;

    // update secondary status to `waiting`
    const setSecondarySourceStatusOpts = {
      key: dataSourceKey,
      secondaryStatus: 'waiting',
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
      page: nextPage,
    };
    const setSecondarySourceStatusOpts = {
      key,
      secondaryStatus,
    };

    // console.log('nextPage', nextPage, 'setSourceDataOpts', setSourceDataOpts);
    // commit
    this.store.commit('setSourceDataMore', setSourceDataOpts);
    this.store.commit('setSecondarySourceStatus', setSecondarySourceStatusOpts);
  }


  defineTargets(dataSourceKey, targetsDef) {
    // console.log('defineTargets is running, dataSourceKey:', dataSourceKey, 'targetsDef:', targetsDef);
    const state = this.store.state;
    // targets may cause a looped axios call, or may just call one once and get multiple results
    let targetsFn = targetsDef.get;
    // let targetIdFn = targetsDef.getTargetId;

    if (typeof targetsFn !== 'function') {
      throw new Error(`Invalid targets getter for data source '${dataSourceKey}'`);
    }
    let targets = targetsFn(state);
    let targetIdFn = targetsDef.getTargetId;

    // console.log("Define Targets Starting, targets:", targets);
    // check if target objs exist in state.
    let targetIds;
    if ( typeof targets.length != 'undefined'){
      targetIds = targets.map(targetIdFn);
    }
    // console.log("targetIds: ", targetIds)
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

    // console.log('in defineTargets, shouldCreateTargets:', shouldCreateTargets);

    // if not, create them.
    if (shouldCreateTargets) {
      // console.log('should create targets', targetIds, stateTargetIds);
      this.store.commit('createEmptySourceTargets', {
        key: dataSourceKey,
        targetIds,
      });
    }

    if (!Array.isArray(targets)) {
      throw new Error('Data source targets getter should return an array');
    }

    // this over-rides if the targets are set to "runOnce = true"
    if (targetsDef.runOnce) {
      // console.log('if targetsDef.runOnce is running');
      let idsOfOwnersOrProps = "";
      for (let target of targets) {
        // console.log('in for loop, target:', target);
        if(target.properties){
          idsOfOwnersOrProps = idsOfOwnersOrProps + "'" + target.properties.opa_account_num + "',";
        } else {
          idsOfOwnersOrProps = idsOfOwnersOrProps + "'" + target.parcel_number + "',";
        }
      }
      idsOfOwnersOrProps = idsOfOwnersOrProps.substring(0, idsOfOwnersOrProps.length - 1);
      targets = [ idsOfOwnersOrProps ];
    }
    // console.log("defineTargets targets: ", targets)
    return targets;
  }

  fetchData(optionalFeature) {
    // console.log('\nFETCH DATA STARTING, optionalFeature:', optionalFeature);
    // console.log('-----------');
    let geocodeObj;
    let ownerSearchObj;
    let shapeSearchObj;
    let blockSearchObj;
    if (this.store.state.geocode.data && this.store.state.geocode.data.condo === true && this.store.state.condoUnits.units.length) {
    // if (this.store.state.lastSearchMethod === 'geocode' && this.store.state.geocode.data.condo === true) {

      // console.log('in if, this.store.state.parcels.pwd[0].properties.PARCELID:', this.store.state.parcels.pwd[0].properties.PARCELID);
      if (Array.isArray(this.store.state.parcels.pwd)) {
        geocodeObj = this.store.state.condoUnits.units[Number(this.store.state.parcels.pwd[0].properties.PARCELID)][0];
      } else {
        geocodeObj = this.store.state.condoUnits.units[Number(this.store.state.parcels.pwd.properties.PARCELID)][0];
      }

      // geocodeObj = this.store.state.geocode.data;//.units[Number(this.store.state.parcels.pwd[0].properties.PARCELID)][0];
      // ownerSearchObj = geocodeObj;

    } else {
      // console.log('fetchData, in else, setting geocodeObj');
      geocodeObj = this.store.state.geocode.data;
      ownerSearchObj = this.store.state.ownerSearch.data;
      blockSearchObj = this.store.state.blockSearch.data;
      if (this.store.state.shapeSearch.data) {
        shapeSearchObj = this.store.state.shapeSearch.data.rows;
      }
    }

    // console.log('geocodeObj first time:', geocodeObj);
    // let ownerSearchObj = this.store.state.ownerSearch.data;

    let doPins = false;
    if (optionalFeature) {
      if (optionalFeature === "pins") {
        doPins = true;
      }
      geocodeObj = optionalFeature;
    } //else {
    //   geocodeObj = this.store.state.geocode.data;
    // }

    let dataSources = {};
    if (doPins) {
      // console.log('fetchData is running on pins');
      dataSources = this.config.pinSources || {};
    } else {
      dataSources = this.config.dataSources || {};
    }

    let dataSourceKeys = Object.entries(dataSources);
    // console.log('in fetchData, dataSources before filter:', dataSources, 'dataSourceKeys:', dataSourceKeys);
    // console.log('geocodeObj:', geocodeObj, 'blockSearchObj:', blockSearchObj, 'shapeSearchObj:', shapeSearchObj);

    // this was added to allow fetchData to run even without a geocode result
    // for the real estate tax site which sometimes needs data from TIPS
    // even if the property is not in OPA and AIS
    let astate = this.store.state;
    if (!geocodeObj && !ownerSearchObj && !blockSearchObj  && !shapeSearchObj) {
      dataSourceKeys = dataSourceKeys.filter(dataSourceKey => {
        console.log('in fetchData, inside if and filter, dataSourceKey:', dataSourceKey, 'astate.sources:', astate.sources);
        if (dataSourceKey[1].dependent) {
          if (dataSourceKey[1].dependent === 'parcel' || dataSourceKey[1].dependent === 'none') {
            return true;
          } else if (dataSourceKey[1].dependent) {
            console.log('astate.sources:', astate.sources, 'dataSourceKey:', dataSourceKey, 'astate.sources[dataSourceKey[1].dependent]:', astate.sources[dataSourceKey[1].dependent]);
            if (astate.sources[dataSourceKey[1].dependent].status === 'success') {
              return true;
            }
          }
        }
      });
    }

    console.log('in fetchData, dataSources after filter:', dataSources, 'dataSourceKeys:', dataSourceKeys);

    // get "ready" data sources (ones whose deps have been met)
    // for (let [dataSourceKey, dataSource] of Object.entries(dataSources)) {
    for (let [ dataSourceKey, dataSource ] of dataSourceKeys) {
      console.log('fetchData loop, dataSourceKey:', dataSourceKey, 'dataSource:', dataSource);
      const state = this.store.state;
      const type = dataSource.type;
      const targetsDef = dataSource.targets;
      // console.log('targetsDef:', targetsDef);

      // if the data sources specifies a features getter, use that to source
      // features for evaluating params/forming requests. otherwise,
      // default to the geocode result.
      let targets;
      let targetIdFn;
      let targetsFn;

      if (targetsDef) {
        // console.log('in fetchData, IF targetsDef is true, targetsDef:', targetsDef);
        targetsFn = targetsDef.get;
        targetIdFn = targetsDef.getTargetId;

        // this is a ridiculous hack that routes over to a function specifically for PDE
        if (this.config.app) {
          if (this.config.app.title === 'Property Data Explorer') {
            targets = this.defineTargets(dataSourceKey, targetsDef);
            // console.log('in Property Data Explorer, targets:', targets);
          }
        } else {

          if (typeof targetsFn !== 'function') {
            throw new Error(`Invalid targets getter for data source '${dataSourceKey}'`);
          }
          targets = targetsFn(state);

          // console.log('in fetchData, dataSourceKey:', dataSourceKey, 'dataSource:', dataSource, 'targetsDef is NOT true, targets:', targets);

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

          // console.log('in fetchData, shouldCreateTargets:', shouldCreateTargets);

          // if not, create them.
          if (shouldCreateTargets) {
            // console.log('should create targets', targetIds, stateTargetIds);
            this.store.commit('createEmptySourceTargets', {
              key: dataSourceKey,
              targetIds,
            });
          }

          if (!Array.isArray(targets)) {
            throw new Error('Data source targets getter should return an array');
          }
        }
      } else {
        // console.log('in fetchData, ELSE (no targetsDef) is running');
        targets = [ geocodeObj ];
      }

      // console.log('in fetchData, dataSourceKey:', dataSourceKey, 'targets:', targets, 'doPins:', doPins);

      for (let target of targets) {
        // console.log('fetchData, target:', target, 'target.length:', target.length);

        // get id of target
        let targetId;
        if (targetIdFn) {
          targetId = targetIdFn(target);
        }

        // targetId && console.log('target:', targetId);

        // check if it's ready
        const isReady = this.checkDataSourceReady(dataSourceKey, dataSource, targetId);
        // console.log('isReady:', isReady);
        if (!isReady) {
          // console.log('not ready');
          continue;
        }

        // console.log('still going after isReady test');

        // update status to `waiting`
        const setSourceStatusOpts = {
          key: dataSourceKey,
          status: 'waiting',
        };
        if (targetId) {
          setSourceStatusOpts.targetId = targetId;
        }

        this.store.commit('setSourceStatus', setSourceStatusOpts);

        if (targetsDef) {
          if (targetsDef.runOnce) {
            targetIdFn = function(feature) {
              return feature.parcel_number;
            };
          }
        }

        // console.log('in FetchData right before switch');

        // TODO do this for all targets
        switch(type) {
        case 'ago-token':
          console.log('this.clients.agoToken:', this.clients.agoToken);
          this.clients.agoToken.fetch();

          break;

        case 'http-get':
          // console.log('http-get, target:', target, 'dataSource:', dataSource, 'dataSource.segments:', dataSource.segments, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn);
          if (this.config.app) {
            if (this.config.app.title === 'Property Data Explorer') {
              this.clients.http.fetchPde(target,
                dataSource,
                dataSourceKey,
                targetIdFn);
              // } else if (dataSource.segments == true) {
              //   console.log('segments is true, http-get, target:', target, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn);

            // } else if (dataSource.segments == true) {
            //   console.log('segments is true, http-get, target:', target, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn);
            //   this.clients.http.fetchDataInSegments(target,
            //     dataSource,
            //     dataSourceKey,
            //     targetIdFn);
            } else {
              this.clients.http.fetch(target,
                dataSource,
                dataSourceKey,
                targetIdFn);
            }
          } else if (dataSource.segments == true) {
            console.log('segments is true, http-get, target:', target, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn);
            this.clients.http.fetchDataInSegments(target,
              dataSource,
              dataSourceKey,
              targetIdFn);
          } else {
            this.clients.http.fetch(target,
              dataSource,
              dataSourceKey,
              targetIdFn);
          }

          break;

        case 'http-get-nearby':
          // console.log('http-get-nearby', dataSourceKey, targetIdFn)
          this.clients.http.fetchNearby(target,
            dataSource,
            dataSourceKey,
            targetIdFn);
          break;

        case 'esri':
          console.log('esri', dataSourceKey);
          // TODO add targets id fn
          this.clients.esri.fetch(target, dataSource, dataSourceKey);
          break;

        case 'esri-nearby':
          // console.log('esri-nearby', dataSourceKey)
          // TODO add targets id fn
          this.clients.esri.fetchNearby(target, dataSource, dataSourceKey);
          break;

        case 'airtable':
          this.clients.airtable.fetch(target,
            dataSource,
            dataSourceKey,
            targetIdFn);
          break;

        default:
          throw `Unknown data source type: ${type}`;
        }  // end of switch
      }  // end of for targets loop
      // console.log('end of targets loop for', dataSourceKey);
    } // end of for dataSource loop
    // console.log('end of outer loop');
  }

  didFetchData(key, status, dataOrNull, targetId, targetIdFn) {
    // console.log('didFetchData, this.config.dataSources[key]:', this.config.dataSources[key]);

    let data = status === 'error' ? null : dataOrNull;
    // console.log('data-manager DID FETCH DATA, key:', key, 'targetId:', targetId || '', 'data:', data.features[0], 'targetIdFn:', targetIdFn);
    // console.log('data-manager DID FETCH DATA, key:', key, 'data:', data, 'targetId:', targetId || '', 'targetIdFn:', targetIdFn);

    // assign feature ids
    if (Array.isArray(data)) {
      // console.log('didFetchData if is running, data:', data, 'key:', key);
      if (this.config.dataSources[key].segments) {
        let value = [];
        let dataPoints;
        if (data[0].features) {
          dataPoints = 'features';
        } else if (data[0].rows) {
          dataPoints = 'rows';
        }
        // console.log('didFetchData, data:', data, 'Array.isArray(data):', Array.isArray(data));
        if (data && Array.isArray(data)) {
          value = data[0][dataPoints];
          for (let i=1;i<data.length;i++) {
            // console.log('didFetchData value:', value, 'data.length:', data.length, 'data[i]', data[i]);
            value = value.concat(data[i][dataPoints]);
          }
        } else if (data && data[dataPoints]) {
          value = data[dataPoints];
        }
        data = value;
        // console.log('didFetchData key:', key, 'dataPoints:', dataPoints, 'value:', value);
      } else {
        data = this.assignFeatureIds(data, key, targetId);
      }
    } else if (data) {
      // console.log('didFetchData else if is running, data:', data, 'key:', key, 'targetId:', targetId);
      if (data.rows && data.rows.length) {
        data.rows = this.assignFeatureIds(data.rows, key, targetId);
      } else if (data.records && data.records.length) {
        data.records = this.assignFeatureIds(data.records, key, targetId);
      } else {
        data.features = this.assignFeatureIds(data.features, key, targetId);
      }
    }

    const setSourceStatusOpts = { key, status };
    const setSourceDataOpts = { key, data };

    if (targetId) {
      setSourceStatusOpts.targetId = targetId;
      setSourceDataOpts.targetId = targetId;
    }
    this.store.commit('setSourceStatus', setSourceStatusOpts);

    // this doesn't make any sense - why is a targetIdFn the determining factor on the state data structure?
    if (targetIdFn) {
      let sourceDataObj = this.turnToTargets(key, data, targetIdFn);
      this.store.commit('setSourceDataObject', sourceDataObj);
    } else {
      this.store.commit('setSourceData', setSourceDataOpts);
    }

    // try fetching more data
    // console.log('data-manager.js - didFetchData - is calling fetchData on targetId', targetId, 'key', key);
    this.fetchData();
  }

  // TODO - this is probably completely wasteful
  turnToTargets(key, data, targetIdFn) {
    // console.log('turnToTargets, key:', key, 'data:', data);
    let newLargeObj = { 'key': key };
    let newSmallObj = {};
    for (let datum of data) {
      newSmallObj[datum.parcel_number] = {
        'data': datum,
      };
    }
    newLargeObj['data'] = newSmallObj;
    return newLargeObj;
  }

  resetData() {
    // console.log('data-manager.js, resetData is running');
    const dataSources = this.config.dataSources || {};

    for (let dataSourceKey of Object.keys(dataSources)) {
      const dataSource = dataSources[dataSourceKey];
      const targetsDef = dataSource.targets;

      if (dataSource.resettable !== false) {
        // null out existing data in state
        if (targetsDef) {
          this.store.commit('clearSourceTargets', {
            key: dataSourceKey,
          });
        } else {
          this.store.commit('setSourceData', {
            key: dataSourceKey,
            data: null,
          });
          this.store.commit('setSourceStatus', {
            key: dataSourceKey,
            status: null,
          });
        }
      }
    }

    if (this.config.resetExtraData) {
      for (let extraData of Object.keys(this.config.resetDataExtra)) {
        this.store.commit('set' + extraData, this.config.resetDataExtra[extraData]);
      }
    }
  }

  resetShape() {
    // console.log('dataManager resetShape is running');
    this.store.commit('setShapeSearchInput', null);
    this.store.commit('setShapeSearchData', null);
    this.store.commit('setShapeSearchStatus', null);
  }

  resetBlockSearch() {
    this.store.commit('setBlockSearchInput', null);
    this.store.commit('setBlockSearchData', null);
    this.store.commit('setBlockSearchStatus', null);
  }

  resetGeocodeOnly(optionalStatus) {
    // console.log('resetGeocodeOnly is running, this.config.parcels:', this.config.parcels, 'optionalStatus:', optionalStatus);
    // reset geocode
    this.store.commit('setClickCoords', null);
    if (optionalStatus) {
      this.store.commit('setGeocodeStatus', optionalStatus);
    } else {
      this.store.commit('setGeocodeStatus', null);
    }
    this.store.commit('setGeocodeData', null);
    this.store.commit('setGeocodeRelated', null);
    this.store.commit('setUnits', null);
    this.store.commit('setGeocodeInput', null);
  }

  // this gets called when the current geocoded address is wiped out, such as
  // when you click on the "Atlas" title and it navigates to an empty hash
  resetGeocode() {
    // console.log('resetGeocode is running, this.config.parcels:', this.config.parcels);
    // reset geocode
    this.store.commit('setClickCoords', null);
    this.store.commit('setGeocodeStatus', null);
    this.store.commit('setGeocodeData', null);
    this.store.commit('setGeocodeRelated', null);
    this.store.commit('setUnits', null);
    this.store.commit('setGeocodeInput', null);

    // reset parcels
    if (this.config.parcels) {
      if (this.config.parcels.dor) {
        this.store.commit('setParcelData', {
          parcelLayer: 'dor',
          multipleAllowed: true,
          mapregStuff: this.config.parcels.dor.mapregStuff,
          data: [],
          status: null,
          activeParcel: null,
          activeAddress: null,
          activeMapreg: null,
        });
      }
      this.store.commit('setParcelData', {
        parcelLayer: 'pwd',
        multipleAllowed: false,
        mapregStuff: this.config.parcels.pwd.mapregStuff,
        data: null,
      });
      let currentParcels = this.activeTopicConfig().parcels || Object.keys(this.config.parcels)[0];
      // console.log('currentParcels:', currentParcels);
      // this.store.commit('setActiveParcelLayer', 'pwd');
      this.store.commit('setActiveParcelLayer', currentParcels);
    }

    // reset other topic and map state
    // if (this.config.topics.length) {
    // if (this.config.router.returnToDefaultTopicOnGeocode) {
    //   if (this.config.topics != undefined) {
    //     if (this.config.defaultTopic || this.config.defaultTopic === null) {
    //       this.store.commit('setActiveTopic', this.config.defaultTopic);
    //     } else {
    //       // console.log('about to setActiveTopic, config:', this.config.topics[0].key);
    //       this.store.commit('setActiveTopic', this.config.topics[0].key);
    //     }
    //   }
    // }

    // reset data sources
    if (this.store.state.sources && this.config.resetDataOnGeocode === undefined || this.store.state.sources && this.config.resetDataOnGeocode != false) {
      // console.log('data-manager.js, resetGeocode is calling resetData, this.config.resetDataOnGeocode:', this.config.resetDataOnGeocode);
      this.resetData();
    }
  }

  checkDataSourcesFetched(paths = []) {
    // console.log('checkDataSourcesFetched, paths:', paths);
    const state = this.store.state;
    return paths.every(path => {
      // deps can be deep keys, e.g. `dor.parcels`. split on periods to get
      // a sequence of keys.
      const pathKeys = path.split('.');

      // TODO/TEMP restructure state so parcels and geocode live in
      // state.sources? the following targets the dorDocuments data source.
      const isDorParcels = (pathKeys.length === 2
                            && pathKeys[1] === "dor");

      // console.log('check data sources fetched', paths, 'pathKeys.length:', pathKeys.length, 'pathKeys[0]:', pathKeys[0], 'pathKeys[1]:', pathKeys[1], 'isDorParcels:', isDorParcels);

      if (isDorParcels) {
        return state.parcels.dor.status === 'success';
      }

      // traverse state to get the parent of the data object we need to
      // check.
      const stateObj = pathKeys.reduce((acc, pathKey) => {
        return acc[pathKey];
      }, state);

      console.log('paths:', paths, 'stateObj:', stateObj);

      return stateObj.status === 'success';
    });
  }

  checkDataSourceReady(key, options, targetId) {
    // console.log('checkDataSourceReady, key:', key, 'options:', options, 'targetId:', targetId);

    const deps = options.deps;
    // console.log('deps', deps);
    const depsMet = this.checkDataSourcesFetched(deps);
    // console.log('key:', key, 'depsMet', depsMet);
    let isReady = false;

    // if data deps have been met
    if (depsMet) {
      // get the target obj
      let targetObj = this.store.state.sources[key] || this.store.state.pinSources[key];
      if (targetId) {
        targetObj = targetObj.targets[targetId];
      }
      // console.log('checkDataSourceReady, IF depsMet is TRUE, targetObj:', targetObj, '!targetObj.status:', targetObj.status, '!targetObj.status:', !targetObj.status);

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
      // console.log('data-manager.js assignFeatureIds is running, dataSourceKey:', dataSourceKey, 'feature:', feature);
      try {
        feature._featureId = id;
      } catch (e) {
        console.warn(e);
      }
      featuresWithIds.push(feature);
    }

    // console.log('data-manager assignFeatureIds is running', dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  }

  /* GEOCODING */
  geocode(input, category) {
    // console.log('data-manager geocode is running, input:', input, 'category:', category);
    // if (category === 'address') {
    // const didGeocode = this.didGeocode.bind(this);
    return this.clients.geocode.fetch(input);//.then(didGeocode);
    // } else if (category === 'owner') {
    //   // console.log('category is owner');
    //   const didOwnerSearch = this.didOwnerSearch.bind(this);
    //   return this.clients.ownerSearch.fetch(input).then(didOwnerSearch);
    // } else if (category == null) {
    //   // console.log('no category');
    //   const didTryGeocode = this.didTryGeocode.bind(this);
    //   const test = this.clients.geocode.fetch(input).then(didTryGeocode);
    // }
  }

  didOwnerSearch() {
    // console.log('callback from owner search is running');
  }

  didTryGeocode(feature) {
    console.log('didTryGeocode is running, feature:', feature);
    let blockTerms = [ "block", "block:", "blk" ];
    let blockSearchCheck;
    blockTerms.map( x=> this.store.state.geocode.input.trim().toLowerCase().startsWith(x)? blockSearchCheck = true : "");
    console.log("input: ", input, "blockSearchCheck: ", blockSearchCheck);

    if (this.store.state.geocode.status === 'error') {

      // this was added to allow fetchData to run even without a geocode result
      // for the real estate tax site which sometimes needs data from TIPS
      // even if the property is not in OPA and AIS
      if (this.config.onGeocodeFail) {
        // console.log('onGeocodeFail exists');
        let feature = {
          properties: {},
        };
        feature.properties.opa_account_num = this.store.state.geocode.input;
        console.log('data-manager.js didTryGeocode is calling resetData');
        this.resetData();
        this.resetShape();
        this.fetchData(feature);

      } else if(blockSearchCheck === true){
        console.log("block search is true");
        const input = this.store.state.geocode.input;
        this.clearOwnerSearch();
        return this.clients.blockSearch.fetch(input);
      } else {
        this.clearBlockSearch();
        const input = this.store.state.geocode.input;
        const didOwnerSearch = this.didOwnerSearch.bind(this);
        return this.clients.ownerSearch.fetch(input).then(didOwnerSearch);
      }
    } else if (this.store.state.geocode.status === 'success') {
      // this.didGeocode(feature);
      this.clearOwnerSearch();
      this.clearBlockSearch();
    }
  }

  getParcelsById(id, parcelLayer) {
    // console.log('data-manager.js getParcelsById', parcelLayer, 'id:', id);
    const url = this.config.map.featureLayers[parcelLayer+'Parcels'].url + '/query';
    const configForParcelLayer = this.config.parcels[parcelLayer];
    const geocodeField = configForParcelLayer.geocodeField;
    // console.log('url:', url);
    let parcelQuery;

    if (id.includes('|')) {
      const idSplit = id.split('|');
      let queryString = geocodeField + " = '";
      let i;
      for (i=0; i<idSplit.length; i++) {
        queryString = queryString + idSplit[i] + "'";
        if (i < idSplit.length - 1) {
          queryString = queryString + " or " + geocodeField + " = '";
        }
      }

      parcelQuery = url + '?where=' + queryString;

    } else if (Array.isArray(id)) {
      parcelQuery = url + '?where=' + geocodeField + ' IN (' + id + ')';
    } else {
      parcelQuery = url + '?where=' + geocodeField + "='" + id + "'";
    }
    // console.log('parcelQuery:', parcelQuery);

    return new Promise(function(resolve, reject) {
      let params = {
        'outSR': 4326,
        'f': 'geojson',
        'outFields': '*',
        'returnGeometry': true,
      };

      axios.get(parcelQuery, { params }).then(function(response, error) {
        // console.log('end of getParcelsById response:', response);//, 'featureCollection:', featureCollection);
        if (error) {
          reject(error);
        } else {
          resolve(response.data);
        }
      });
    });
  }

  getParcelsByLatLng(latlng, parcelLayer, fetch) {
    console.log('data-manager.js getParcelsByLatLng, latlng:', latlng, 'parcelLayer:', parcelLayer, 'fetch:', fetch, 'this.config.map.featureLayers:', this.config.map.featureLayers);
    if( latlng != null) {
      const url = this.config.map.featureLayers[parcelLayer+'Parcels'].url + '/query';
      return new Promise(function(resolve, reject) {
        let params = {
          'where': '1=1',
          'outSR': 4326,
          'f': 'geojson',
          'outFields': '*',
          'returnGeometry': true,
          'geometry': { "x": latlng.lng, "y": latlng.lat, "spatialReference":{ "wkid":4326 }},
          'geometryType': 'esriGeometryPoint',
          'spatialRel': 'esriSpatialRelWithin',
        };

        axios.get(url, { params }).then(function(response, error) {
          // console.log('end of getParcelsById response:', response);
          if (error) {
            reject(error);
          } else {
            resolve(response.data);
          }
        });
      });
    }
    return;
  }

  getParcelsByShape(latlng, parcelLayer) {
    console.log('getParcelsByShape is running, latlng:', latlng, 'latlng._latlngs:', latlng._latlngs, 'parcelLayer:', parcelLayer);
    let theLatLngs = [];
    if (latlng._latlngs) {
      for (let latLng of latlng._latlngs[0]) {
        theLatLngs.push([ latLng.lng, latLng.lat ]);
      }
      theLatLngs.push([ latlng._latlngs[0][0].lng, latlng._latlngs[0][0].lat ]);
    } else {
      theLatLngs = latlng;
    }

    const url = this.config.map.featureLayers.pwdParcels.url + '/query?';

    let theGeom = { "rings": [ theLatLngs ], "spatialReference": { "wkid": 4326 }};
    let parcelQuery = url + '?';

    return new Promise(function(resolve, reject) {
      let params = {
        'where': '1=1',
        'inSr': 4326,
        'outSR': 4326,
        'f': 'geojson',
        'outFields': '*',
        'returnGeometry': true,
        'geometryType': 'esriGeometryPolygon',
        'spatialRel': 'esriSpatialRelIntersects',
        'geometry': theGeom,
      };

      axios.get(url, { params }).then(function(response, error) {
        if (error) {
          reject(error);
        } else {
          resolve(response.data);
        }
      });
    });
  }

  processParcels(error, featureCollection, parcelLayer, fetch) {
    const multipleAllowed = this.config.parcels[parcelLayer].multipleAllowed;
    // console.log('data-manager.js processParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'featureCollection:', featureCollection, 'multipleAllowed:', multipleAllowed);
    const mapregStuff = this.config.parcels[parcelLayer].mapregStuff;

    if (error || !featureCollection || featureCollection.features.length === 0) {
      return;
    }

    const features = featureCollection.features;

    const featuresSorted = utils.sortDorParcelFeatures(features);
    let feature;

    // this is for figuring out which parcel address to keep at the top
    if (!multipleAllowed) {
      feature = features[0];
    // dor
    } else {
      feature = featuresSorted[0];
    }

    // use turf to get area and perimeter of all parcels returned
    for (let featureSorted of featuresSorted) {
      // console.log('featureSorted:', featureSorted);
      const geometry = utils.calculateAreaAndPerimeter(featureSorted);
      featureSorted.properties.TURF_PERIMETER = geometry.perimeter;
      featureSorted.properties.TURF_AREA = geometry.area;
    }

    // at this point there is definitely a feature or features - put it in state
    this.setParcelsInState(parcelLayer, multipleAllowed, feature, featuresSorted, mapregStuff);
    return feature;
  }

  setParcelsInState(parcelLayer, multipleAllowed, feature, featuresSorted, mapregStuff) {
    // console.log('setParcelsInState is running, parcelLayer:', parcelLayer, 'multipleAllowed:', multipleAllowed, 'feature:', feature, 'featuresSorted:', featuresSorted, 'mapregStuff:', mapregStuff);
    let payload;
    // pwd
    if (!multipleAllowed && !mapregStuff) {
      // console.log('1');
      payload = {
        parcelLayer,
        multipleAllowed,
        mapregStuff,
        data: feature,
      };
    } else if (multipleAllowed && !mapregStuff) {
      // console.log('2');
      payload = {
        parcelLayer,
        multipleAllowed,
        mapregStuff,
        data: featuresSorted,
        status: 'success',
      };

    // dor
    } else {
      // console.log('3');
      payload = {
        parcelLayer,
        multipleAllowed,
        mapregStuff,
        data: featuresSorted,
        status: 'success',
        activeParcel: feature ? feature.id : null,
        // TODO apply concatDorAddress in client config - this global is no
        // longer available
        // activeAddress: feature ? concatDorAddress(feature) : null,
        activeAddress: null,
        activeMapreg: feature ? feature.properties.MAPREG : null,
      };
    }
    // update state
    this.store.commit('setParcelData', payload);
  }

  clearBlockSearch(){
    // console.log('clearOwnerSearch is running');
    this.store.commit('setBlockSearchTotal', null);
    this.store.commit('setBlockSearchStatus', null);
    this.store.commit('setBlockSearchData', null);
    this.store.commit('setBlockSearchInput', null);
  }

  clearOwnerSearch(){
    // console.log('clearOwnerSearch is running');
    this.store.commit('setOwnerSearchTotal', null);
    this.store.commit('setOwnerSearchStatus', null);
    this.store.commit('setOwnerSearchData', null);
    this.store.commit('setOwnerSearchInput', null);
  }

  removeShape() {
    // console.log('this.store.state.editableLayers:', this.store.state.editableLayers);
    if(this.store.state.editableLayers && this.store.state.editableLayers !== null ){
      this.store.state.editableLayers.clearLayers();
    }
  }


  // getParcelsByBuffer(latlng, parcelLayer) {
  //   console.log('getParcelsByBuffer is running, latlng:', latlng, 'this.store.state.parcels.pwd:', this.store.state.parcels.pwd);
  //
  //   // if (this.store.state.parcels.pwd === null) {
  //   const latLng = L.latLng(latlng.lat, latlng.lng);
  //   const url = this.config.map.featureLayers.pwdParcels.url;
  //   const parcelQuery = Query({ url });
  //   // console.log(parcelQuery);
  //   parcelQuery.contains(latLng);
  //
  //   return new Promise(function(resolve, reject) {
  //     parcelQuery.run((function(error, featureCollection, response) {
  //       if (error) {
  //         reject(error);
  //       } else {
  //         resolve(response);
  //       }
  //     }));
  //   });
  // }

  // finishParcelsByBuffer(error = [], featureCollection = [], response = {}, parcelLayer, latlng) {
  //   console.log('finishParcelsByBuffer is running, error:', error, 'featureCollection:', featureCollection, 'response:', response, 'parcelLayer', parcelLayer, 'latlng:', latlng);
  //
  //   const projection4326 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
  //   const projection2272 = "+proj=lcc +lat_1=40.96666666666667 +lat_2=39.93333333333333 +lat_0=39.33333333333334 +lon_0=-77.75 +x_0=600000 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs";
  //
  //   const parcelUrl = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/PWD_PARCELS/FeatureServer/0';
  //   const geometryServerUrl = '//gis-utils.databridge.phila.gov/arcgis/rest/services/Utilities/Geometry/GeometryServer/';
  //   const calculateDistance = true;
  //   const distances = 250;
  //
  //   // if you do it by point
  //   const coords = [latlng.lng, latlng.lat];
  //   const coords2272 = proj4(projection4326, projection2272, [coords[0], coords[1]]);
  //   // console.log('coords:', coords, 'coords2272:', coords2272);
  //
  //   // if you do it by parcel
  //   let parcelGeom
  //   // if (this.store.state.parcels.pwd !== null) {
  //   //   parcelGeom = this.store.state.parcels.pwd.geometry;
  //   // } else {
  //     parcelGeom = response.features[0].geometry
  //   // }
  //
  //   console.log('parcelGeom:', parcelGeom);
  //
  //   let polyCoords2272 = []
  //   for (let polyCoord of parcelGeom.coordinates[0]) {
  //     let polyCoord2272 = proj4(projection4326, projection2272, [polyCoord[0], polyCoord[1]])
  //     polyCoords2272.push(polyCoord2272);
  //   }
  //
  //   let newGeometries = {
  //     "geometryType": "esriGeometryPolygon",
  //     "geometries": [{ "rings": [polyCoords2272] }]
  //   }
  //
  //   const params = {
  //     // geometries: `[${coords2272.join(', ')}]`,
  //     geometries: newGeometries,
  //     inSR: 2272,
  //     outSR: 4326,
  //     bufferSR: 2272,
  //     distances: distances, //|| 0.0028,
  //     // inSR: 4326,
  //     // outSR: 4326,
  //     // bufferSR: 4326,
  //     // distances: distances, //|| 0.0028,
  //     unionResults: true,
  //     geodesic: false,
  //     f: 'json',
  //   };
  //   // console.log('esri nearby params', params);
  //
  //   // get buffer polygon
  //   const bufferUrl = geometryServerUrl.replace(/\/$/, '') + '/buffer';
  //   // console.log('bufferUrl:', bufferUrl);
  //
  //   axios.get(bufferUrl, { params }).then(response => {
  //     const data = response.data;
  //     // console.log('axios in finishParcelsByBuffer is running, response:', response);//, 'data:', data);
  //
  //     // console.log('did get esri nearby buffer', data);
  //
  //     const geoms = data.geometries || [];
  //     const geom = geoms[0] || {};
  //     const rings = geom.rings || [];
  //     const xyCoords = rings[0];
  //
  //     // check for xy coords
  //     if (!xyCoords) {
  //       // we can't do anything without coords, so bail out
  //       // this.dataManager.didFetchData(dataSourceKey, 'error');
  //       return;
  //     }
  //
  //     const latLngCoords = xyCoords.map(xyCoord => [...xyCoord].reverse());
  //
  //     // get nearby features using buffer
  //     const buffer = L.polygon(latLngCoords);
  //     const map = this.store.state.map.map;
  //
  //     // DEBUG
  //     this.store.commit('setBufferShape', latLngCoords);
  //     // buffer.addTo(map);
  //
  //     //this is a space holder
  //     const parameters = {};
  //     this.fetchBySpatialQuery(parcelUrl,
  //                              'intersects',
  //                              buffer,
  //                              parameters,
  //                              calculateDistance ? coords : null,
  //                              // options,
  //                             );
  //   }, response => {
  //     // console.log('getParcelsByBuffer error:', response);
  //
  //     // this.dataManager.didFetchData(dataSourceKey, 'error');
  //   });
  // }

  // didGeocode(feature) {
  //   let geocodeZoom = 19;
  //   if (this.config.map.geocodeZoom) {
  //     geocodeZoom = this.config.map.geocodeZoom;
  //   }
  //   console.log('DataManager.didGeocode:', feature, 'geocodeZoom:', geocodeZoom);
  //   this.controller.router.didGeocode();
  //   if (!this.config.parcels) {
  //     if (this.store.state.map) {
  //       this.store.commit('setMapCenter', feature.geometry.coordinates);
  //       this.store.commit('setMapZoom', geocodeZoom);
  //     }
  //     return
  //   }
  //
  //   const activeParcelLayer = this.store.state.activeParcelLayer;
  //   const lastSearchMethod = this.store.state.lastSearchMethod;
  //   const configForActiveParcelLayer = this.config.parcels[activeParcelLayer];
  //   // // const multipleAllowed = configForParcelLayer.multipleAllowed;
  //   // const geocodeField = configForParcelLayer.geocodeField;
  //   const parcelLayers = Object.keys(this.config.parcels || {});
  //   const otherParcelLayers = Object.keys(this.config.parcels || {});
  //   otherParcelLayers.splice(otherParcelLayers.indexOf(activeParcelLayer), 1);
  //   // console.log('didGeocode - activeParcelLayer:', activeParcelLayer, 'parcelLayers:', parcelLayers, 'otherParcelLayers:', otherParcelLayers);
  //
  //   // if it is a dor parcel query, and the geocode fails, coordinates can still be used
  //   // to get dor parcels which are not in ais
  //   // set coords to the ais coords OR the click if there is no ais result
  //   let coords, lat, lng, latlng;
  //   // if geocode fails
  //   if (!feature) {
  //     console.log('didGeocode - no geom');
  //     if (lastSearchMethod === 'reverseGeocode') {
  //       const clickCoords = this.store.state.clickCoords;
  //       coords = [clickCoords.lng, clickCoords.lat];
  //       [lng, lat] = coords;
  //       latlng = L.latLng(lat, lng);
  //     }
  //   // if geocode succeeds
  //   } else {
  //     // console.log('didGeocode - GEOM', feature);
  //     coords = feature.geometry.coordinates;
  //     [lng, lat] = coords;
  //     latlng = L.latLng(lat, lng);
  //   }
  //
  //   // if (coords) {
  //   //   const [lng, lat] = coords;
  //   //   const latlng = L.latLng(lat, lng);
  //   // }
  //
  //   // all of this happens whether geocode failed or succeeded
  //   // search box or onload - get parcels by id
  //   // (unless it fails and you are allowed to get them by LatLng on failure)
  //   if (lastSearchMethod === 'geocode') {
  //     if (feature) {
  //       // console.log('didGeocode lastSearchMethod:', lastSearchMethod, '- attempting to get all parcel layers:', parcelLayers, ' by ID');
  //       // loop through the parcels, and get them by their ids
  //       for (let parcelLayer of parcelLayers) {
  //         const configForParcelLayer = this.config.parcels[parcelLayer];
  //         const parcelIdInGeocoder = configForParcelLayer.parcelIdInGeocoder
  //         const parcelId = feature.properties[parcelIdInGeocoder];
  //         if (parcelId && parcelId.length > 0) {
  //           this.getParcelsById(parcelId, parcelLayer);
  //         } else {
  //           if (configForParcelLayer.getByLatLngIfIdFails) {
  //             // console.log(parcelLayer, 'Id failed - had to get by LatLng')
  //             console.log('in if lastSearchMethod === geocode, parcelLayer:', parcelLayer);
  //             this.getParcelsByLatLng(latlng, parcelLayer);
  //           }
  //         }
  //       }
  //     }
  //
  //   // map-click - get pwd and dor parcels (whichever has not already been found) by latlng
  //   // this is needed because it will not automatically get the dor parcels in case it does not find a pwd parcel
  //   // and vice versa
  //   } else if (lastSearchMethod === 'reverseGeocode') {
  //     if (feature) {
  //       // console.log('didGeocode lastSearchMethod:', lastSearchMethod, 'feature', feature, '- getting other parcel layers by id or latlng')
  //       for (let otherParcelLayer of otherParcelLayers) {
  //         const configForOtherParcelLayer = this.config.parcels[otherParcelLayer];
  //         const parcelIdInGeocoder = configForOtherParcelLayer.parcelIdInGeocoder
  //         const parcelId = feature.properties[parcelIdInGeocoder];
  //         if (parcelId && parcelId.length > 0) {
  //           this.getParcelsById(parcelId, otherParcelLayer);
  //         } else {
  //           if (configForOtherParcelLayer.getByLatLngIfIdFails) {
  //             console.log('in if lastSearchMethod === reverseGeocode, otherParcelLayer:', otherParcelLayer, 'Id failed - had to get by LatLng')
  //             this.getParcelsByLatLng(latlng, otherParcelLayer);
  //           }
  //         }
  //       }
  //     } else {
  //       // console.log('didGeocode lastSearchMethod:', lastSearchMethod, 'NO feature', feature)
  //       const geocodeFailAttemptParcel = configForActiveParcelLayer.geocodeFailAttemptParcel
  //       if (geocodeFailAttemptParcel) {
  //         // console.log('ran ais on a dor parcel and got no response - should try pwd parcel?', geocodeFailAttemptParcel);
  //         const otherParcel = this.store.state.parcels[geocodeFailAttemptParcel];
  //         // console.log('otherParcel:', otherParcel);
  //         if (otherParcel) {
  //           const configForOtherParcelLayer = this.config.parcels[geocodeFailAttemptParcel];
  //           const geocodeField = configForOtherParcelLayer.geocodeField;
  //           // console.log('running ais again on the pwd parcel', otherParcel.properties[geocodeField]);
  //           this.store.commit('setLastSearchMethod', 'reverseGeocode-secondAttempt')
  //           this.geocode(otherParcel.properties[geocodeField]);
  //         }
  //       }
  //     }
  //   }
  //
  //   // console.log('in didGeocode, activeTopicConfig:', this.activeTopicConfig());
  //   const activeTopicConfig = this.activeTopicConfig();
  //   // console.log('activeTopicConfig.zoomToShape:', activeTopicConfig.zoomToShape);
  //   // const geocodeData = this.store.state.geocode.data || null;
  //   // const geocodeProperties = geocodeData.properties || null;
  //   // const newShape = geocodeProperties.opa_account_num || null;
  //
  //   // only recenter the map on geocode
  //   if (lastSearchMethod === 'geocode' && this.store.state.geocode.status !== 'error') {
  //     if (!activeTopicConfig.zoomToShape) {
  //       // console.log('NO ZOOM TO SHAPE - NOW IT SHOULD NOT BE ZOOMING TO THE SHAPE ON GEOCODE');
  //       if (this.store.state.map) {
  //         let geocodeZoom = 19;
  //         if (this.config.map.geocodeZoom) {
  //           geocodeZoom = this.config.map.geocodeZoom;
  //         }
  //         this.store.commit('setMapCenter', coords);
  //         this.store.commit('setMapZoom', geocodeZoom);
  //       }
  //     } else {
  //       // console.log('ZOOM TO SHAPE - NOW IT SHOULD BE ZOOMING TO THE SHAPE ON GEOCODE');
  //       // this.store.commit('setMapBoundsBasedOnShape', newShape);
  //     }
  //
  //   } else if (activeTopicConfig.zoomToShape && lastSearchMethod === 'reverseGeocode' && this.store.state.geocode.status !== 'error') {
  //     // console.log('ZOOM TO SHAPE - NOW IT SHOULD BE ZOOMING TO THE SHAPE ON REVERSE GEOCODE');
  //     // this.store.commit('setMapBoundsBasedOnShape', newShape);
  //   }
  //
  //   // reset data only when not a rev geocode second attempt
  //   if (lastSearchMethod !== 'reverseGeocode-secondAttempt') {
  //     this.resetData();
  //   }
  //
  //   // as long as it is not an intersection, fetch new data
  //   if (feature) {
  //     if (feature.street_address) {
  //       return;
  //     } else if (feature.properties.street_address) {
  //       this.fetchData();
  //     }
  //   } else {
  //     this.fetchData();
  //   }
  // } // end didGeocode

  // TODO - rename and refactor into smaller tasks
  // didGetParcels(error, featureCollection, parcelLayer, fetch) {
  //
  //   console.log('data-manager.js didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch);
  //   const multipleAllowed = this.config.parcels[parcelLayer].multipleAllowed;
  //   const geocodeField = this.config.parcels[parcelLayer].geocodeField;
  //   const otherParcelLayers = Object.keys(this.config.parcels || {});
  //   otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
  //   const lastSearchMethod = this.store.state.lastSearchMethod;
  //   const activeParcelLayer = this.store.state.activeParcelLayer;
  //
  //
  //   // shouldGeocode - true only if:
  //   // 1. didGetParcels is running because the map was clicked (lastSearchMethod = reverseGeocode)
  //   // 2. didGetParcels' parameter "parcelLayer" = activeParcelLayer
  //   const shouldGeocode = (
  //     activeParcelLayer === parcelLayer &&
  //     lastSearchMethod === 'reverseGeocode'
  //   );
  //
  //   // console.log('didGetParcels - shouldGeocode is', shouldGeocode);
  //   if (shouldGeocode) {
  //     // since we definitely have a new parcel, and will attempt to geocode it:
  //     // 1. wipe out state data on other parcels
  //     // 2. attempt to replace
  //     // if (lastSearchMethod === 'reverseGeocode') { // || !configForParcelLayer.wipeOutOtherParcelsOnReverseGeocodeOnly) {
  //     const clickCoords = this.store.state.clickCoords;
  //     const coords = [clickCoords.lng, clickCoords.lat];
  //     const [lng, lat] = coords;
  //     const latlng = L.latLng(lat, lng);
  //
  //     // console.log('didGetParcels is wiping out the', otherParcelLayers, 'parcels in state');
  //     for (let otherParcelLayer of otherParcelLayers) {
  //       // console.log('for let otherParcelLayer of otherParcelLayers is running');
  //       const configForOtherParcelLayer = this.config.parcels[otherParcelLayer];
  //       const otherMultipleAllowed = configForOtherParcelLayer.multipleAllowed;
  //       this.setParcelsInState(otherParcelLayer, otherMultipleAllowed, null, [])
  //       this.getParcelsByLatLng(latlng, otherParcelLayer, 'noFetch')
  //     }
  //
  //     // console.log('didGetParcels - shouldGeocode is running');
  //     const props = feature.properties || {};
  //     const id = props[geocodeField];
  //     if (id) this.controller.router.routeToAddress(id);
  //
  //
  //
  //
  //   } else {
  //     // console.log('180405 data-manager.js didGetParcels - if shouldGeocode is NOT running');
  //     // if (lastSearchMethod != 'reverseGeocode-secondAttempt') {
  //     // if (fetch !== 'noFetch') {
  //     if (fetch !== 'noFetch' && lastSearchMethod != 'reverseGeocode-secondAttempt') {
  //       console.log('180405 data-manager.js - didGetParcels - is calling fetchData() on feature w address', feature.properties.street_address);
  //       this.fetchData();
  //     }
  //   }
  // }

  // evaluateParams(feature, dataSource) {
  //   const params = {};
  //   const paramEntries = Object.entries(dataSource.options.params);
  //   const state = this.store.state;
  //
  //   for (let [key, valOrGetter] of paramEntries) {
  //     let val;
  //
  //     if (typeof valOrGetter === 'function') {
  //       val = valOrGetter(feature, state);
  //     } else {
  //       val = valOrGetter;
  //     }
  //
  //     params[key] = val;
  //   }
  //
  //   return params;
  // }

}

export default DataManager;
