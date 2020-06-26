/*
The Controller handles events from the UI that have some effect on routing or
data fetching. It is a "thin" class that mostly proxies events to the router and
data manager, and facilitates communication between them.
*/

import Vue from 'vue';
import Router from './router';
import DataManager from './data-manager';
import utils from './utils.js';

import * as L from 'leaflet';
import { query as Query } from 'esri-leaflet';

import {
  GeocodeClient,
  OwnerSearchClient,
  BlockSearchClient,
  HttpClient,
  EsriClient,
  CondoSearchClient,
  ShapeSearchClient,
  BufferSearchClient,
} from './clients';

// console.log('controller.js is being read')

class Controller {
  constructor(opts) {
    // console.log('in Controller constructor, opts:', opts);
    const store = this.store = opts.store;
    const config = this.config = opts.config;
    this.history = window.history;

    // the router and data manager need a ref to the controller
    opts.controller = this;

    // create data manager
    const dataManager = this.dataManager = new DataManager(opts);

    // create router
    opts.dataManager = dataManager;
    this.router = new Router(opts);
    this.vueRouter = opts.router;

    // create clients
    this.clients = {};

    // REVIEW do these need the store any more? or can they just pass the
    // response back to this?
    const clientOpts = { config, store, dataManager: this };
    this.clients.geocode = new GeocodeClient(clientOpts);
    this.clients.ownerSearch = new OwnerSearchClient(clientOpts);
    this.clients.blockSearch = new BlockSearchClient(clientOpts);
    this.clients.http = new HttpClient(clientOpts);
    this.clients.esri = new EsriClient(clientOpts);
    this.clients.condoSearch = new CondoSearchClient(clientOpts);
    this.clients.shapeSearch = new ShapeSearchClient(clientOpts);
    this.clients.bufferSearch = new BufferSearchClient(clientOpts);
  }

  /*
  EVENT HANDLERS
  */

  activeFeatureChange(){
    this.dataManager.fetchRowData();
  }

  appDidLoad() {
    // console.log('pvd appDidLoad is running');
    // route once on load
    this.router.hashChanged();
  }

  getMoreRecords(dataSource, highestPageRetrieved) {
    // console.log('controller.js getMoreRecords is running');
    this.dataManager.fetchMoreData(dataSource, highestPageRetrieved);
  }

  resetGeocode() {
    this.dataManager.resetGeocode();
  }

  resetGeocodeOnly() {
    this.dataManager.resetGeocodeOnly();
  }

  // filterInputSubmit(value, process, searchCategory) {
  //   console.log('controller filterInputSubmit is running, value:', value, 'process:', process);
  //   if (process === 'mapboard') {
  //     this.handleSearchFormSubmit(value);
  //   } else {
  //     this.handleConfigurableInputSubmit(value, searchCategory);
  //   }
  // }
  //
  // handleConfigurableInputSubmit(value, searchCategory) {
  //   console.log('controller handleConfigurableInputSubmit is running, value:', value, 'searchCategory:', searchCategory);
  //   if (searchCategory === 'address') {
  //     this.handleSearchFormSubmit(value, searchCategory);
  //   } else if (searchCategory === 'owner') {
  //     console.log('searchCategory is owner');
  //     this.handleSearchFormSubmit(value, searchCategory);
  //   }
  // }

  initializeStatuses(input, searchCategory) {
    // console.log('initializeStatuses is running', input);
    this.store.commit('setGeocodeStatus', null);
    if (!searchCategory || searchCategory === 'address') {
      this.store.commit('setGeocodeInput', input);
    } else if (searchCategory === 'owner') {
      this.store.commit('setOwnerSearchInput', input);
    } else if (searchCategory === 'keyword') {
      // console.log('initializeStatuses with searchCategory keyword');
      this.router.routeToKeyword(input);
    }
    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }
    if (this.store.state.clickCoords) {
      this.store.commit('setClickCoords', null);
    }

    // clear out state
    const parcelLayers = Object.keys(this.config.parcels || {});

    for (let parcelLayer of parcelLayers) {
      const configForParcelLayer = this.config.parcels[parcelLayer];
      const multipleAllowed = configForParcelLayer.multipleAllowed;
      const mapregStuff = configForParcelLayer.mapregStuff;
      // console.log('in initializeStatuses, mapregStuff:', mapregStuff);
      let payload;
      // pwd
      if (!multipleAllowed || !mapregStuff) {
        payload = {
          parcelLayer: parcelLayer,
          multipleAllowed,
          mapregStuff,
          data: null,
        };
      // dor
      } else {
        payload = {
          parcelLayer: parcelLayer,
          multipleAllowed,
          mapregStuff,
          data: [],
          status: null,
          activeParcel: null,
          activeAddress: null,
          activeMapreg: null,
        };
      }
      // update state
      this.store.commit('setParcelData', payload);
      // console.log('initializeStatuses is running');
    }

    if (this.store.state.lastSearchMethod !== 'buffer search') {
      // console.log('in didGetParcels, removing BufferShape, this.store.state.lastSearchMethod:', this.store.state.lastSearchMethod);
      this.store.commit('setBufferShape', null);
    }
  }

  async runBufferProcess(parcelResponse) {
    let aisResponse = this.store.state.geocode.data;
    // console.log('handleMapClick ran in bufferMode, feature.geometry.coordinates:', aisResponse.geometry.coordinates);
    const latLng = { lat: aisResponse.geometry.coordinates[1], lng: aisResponse.geometry.coordinates[0] };
    // this.store.commit('setMapCenter', aisResponse.geometry.coordinates);
    // let parcelResponse = await this.dataManager.getParcelsByBuffer(latLng, []);
    // console.log('parcelResponse:', parcelResponse);
    if (parcelResponse) {
      let bufferShapeResponse = await this.clients.bufferSearch.fetchBufferShape(null, null, parcelResponse, 'pwd', latLng);
      // console.log('bufferShapeResponse:', bufferShapeResponse);

      const parcelUrl = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/PWD_PARCELS/FeatureServer/0';
      const parameters = {};
      const calculateDistance = true;
      const coords = aisResponse.geometry.coordinates;
      let spatialResponse = await this.clients.bufferSearch.fetchBySpatialQuery(parcelUrl,
        'intersects',
        bufferShapeResponse,
        parameters,
        calculateDistance ? coords : null,
      );

      // console.log('spatialResponse:', spatialResponse);

      if (!spatialResponse) {
        return;
      }

      const features = spatialResponse.features;

      if (features.length === 0) {
        return;
      }
      // at this point there is definitely a feature or features - put it in state
      this.dataManager.setParcelsInState('pwd', true, null, features, false);
      // this.geocode(features);
      this.store.commit('setLastSearchMethod', 'buffer search');
      // this.resetGeocode();
      this.store.commit('setBufferMode', false);
      let shapeResponse = await this.clients.shapeSearch.fetch(features);
      // console.log('shapeResponse:', shapeResponse);
      return shapeResponse;
    }
  }

  async handleSearchFormSubmit(value, searchCategory) {
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running, value:', value, 'searchCategory:', searchCategory);
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running, value:', value, 'searchCategory:', searchCategory, 'this:', this);

    this.dataManager.resetData();
    // Added specifically to reset the condo units not being cleared elsewhere on hash change.
    this.dataManager.resetShape();
    this.dataManager.removeShape();
    this.resetGeocode();

    if(value === '' || value === null) {
      console.log('submitting blank value');
      this.resetGeocode();
      this.dataManager.clearOwnerSearch();
      this.store.commit('setShapeSearchStatus', null);
      this.store.commit('setShapeSearchInput', null);
      this.store.commit('setShapeSearchData', null);
      this.store.commit('setUnits', null);
      this.store.commit('setParcelData', {});
      this.store.commit('setLastSearchMethod', 'geocode');
      this.store.commit('setBufferShape', null);
      // console.log('handleSearchFormSubmit about to call setRouteByGeocode at the start');
      this.router.setRouteByGeocode();
      return;
    }

    let blockTerms = [ "block", "block:", "blk" ];
    let blockSearchCheck = null;
    blockTerms.map( x=> value.trim().toLowerCase().startsWith(x)? blockSearchCheck = true : "");
    this.initializeStatuses(value, searchCategory);
    if(searchCategory === "keyword") {
      return;
    }
    // console.log('after await initializeStatuses is running');

    // TODO rename to aisResponse
    let aisResponse = await this.clients.geocode.fetch(value);
    // console.log('after await aisResponse:', aisResponse, 'aisResponse.properties.street_address:', aisResponse.properties.street_address);//, 'this.clients:', this.clients);

    // if (aisResponse.properties.street_address && !this.store.state.bufferMode) {
    if (aisResponse && !this.store.state.bufferMode) {
      // console.log('handleSearchFormSubmit about to call setRouteByGeocode after geocode');
      this.router.setRouteByGeocode();
    } else if (!this.store.state.bufferMode && blockSearchCheck === true) {
      console.log("block search is true");
      aisResponse = await this.clients.blockSearch.fetch(value);
      this.router.setRouteByOwnerSearch();
    } else if (!this.store.state.bufferMode) {
      aisResponse = await this.clients.ownerSearch.fetch(value);
      this.router.setRouteByOwnerSearch();
    }
    //
    // if (!aisResponse) {
    // let condoResponse;
    // if (this.store.state.condoUnits.units.length) {
    //   console.log('if !aisResponse is running, value:', value);
    //   condoResponse = await this.clients.condoSearch.fetch(value);
    //   console.log('aisResponse:', aisResponse);
    // }



    // TODO
    const { activeParcelLayer, lastSearchMethod } = this.store.state;
    const parcelLayers = Object.keys(this.config.parcels || {});

    // if it is a dor parcel query, and the geocode fails, coordinates can still be used
    // to get dor parcels which are not in ais
    // set coords to the ais coords OR the click if there is no ais result

    // all of this happens whether geocode failed or succeeded
    // search box or onload - get parcels by id
    // (unless it fails and you are allowed to get them by LatLng on failure)
    let theParcels = [];
    let response;
    if (!aisResponse) {
      return;
    }

    // console.log('right before loop');

    // loop through the parcels, and get them by their ids
    for (let parcelLayer of parcelLayers) {
      // console.log('in loop, parcelLayer:', parcelLayer);
      const configForParcelLayer = this.config.parcels[parcelLayer];
      const parcelIdInGeocoder = configForParcelLayer.parcelIdInGeocoder;

      // console.log('in loop, parcelLayer:', parcelLayer, 'parcelIdInGeocoder:', parcelIdInGeocoder, 'configForParcelLayer:', configForParcelLayer);

      let ids;
      if (aisResponse.properties) {
        // console.log('getting ids, first if');
        ids = aisResponse.properties[parcelIdInGeocoder];
      } else if (this.store.state.ownerSearch.data) {
        // console.log('getting ids, middle if')
        ids = this.store.state.ownerSearch.data.map(item => item.properties.pwd_parcel_id );
        ids = ids.filter( id => id != "" );
      } else {
        // console.log('getting ids, else');
        ids = aisResponse.map(item => item.properties.pwd_parcel_id );
        ids = ids.filter( id => id != "" );
      }

      // console.log('about to get parcels, ids:', ids);

      if (ids && ids.length > 0) {
        // console.log('it has ids');
        response = await this.dataManager.getParcelsById(ids, parcelLayer);
        // console.log('in handleSearchFormSubmit, response:', response);
        // if (response.type === 'FeatureCollection') {
        //   theParcels = response.features;
        // } else {
        //   theParcels.push(response);
        // }
        // console.log('theParcels:', theParcels);
        // TODO - catch error before this if necessary
      } else {
        // console.log('ids length is 0');
        if (configForParcelLayer.getByLatLngIfIdFails) {
          // console.log(parcelLayer, 'Id failed - had to get by LatLng')
          // console.log('in if lastSearchMethod === geocode, parcelLayer:', parcelLayer);
          // TODO update getParcelByLAtLng to return parcels
          const coords = aisResponse.geometry.coordinates;
          let [ lng, lat ] = coords;
          const latlng = L.latLng(lat, lng);
          response = await this.dataManager.getParcelsByLatLng(latlng, parcelLayer);
          // theParcels.push(response);
        }
      }

      this.dataManager.processParcels(false, response, parcelLayer);
      // this.dataManager.resetData();
      let parcelResponse = response;

      if (this.store.state.bufferMode) {
        await this.runBufferProcess(response);
      }

      // console.log('still going, parcelResponse:', parcelResponse);
      this.dataManager.fetchData();
    }

    // this.router.setRouteByGeocode()
    if (this.config.app && this.config.app.title === 'Property Data Explorer' && this.store.state.lastSearchMethod !== 'owner search') {
      this.router.setRouteByGeocode(this.store.state.parcels.pwd[0].properties.ADDRESS);
    }
    // if (this.config.app && this.config.app.title === 'Property Data Explorer' && this.store.state.lastSearchMethod !== 'block search') {
    //   this.router.setRouteByGeocode(this.store.state.blockSearch.input);
    // }
    // console.log('end of handleSearchFormSubmit');
  }

  async handleMapClick(e) {
    // console.log('handle map click', e, this);

    // TODO figure out why form submits via enter key are generating a map
    // click event and remove this
    if (e.originalEvent) {
      if (e.originalEvent.keyCode === 13) {
        return;
      }
    }

    // get parcels that intersect map click xy
    let latLng;

    if (e.latlng) {
      latLng = e.latlng;
    } else if (e.mapboxEvent) {
      if (e.mapboxEvent.lngLat) {
        latLng = {
          lat: e.mapboxEvent.lngLat.lat,
          lng: e.mapboxEvent.lngLat.lng,
        };
      }
    }

    // if click is on a topic with pwd parcels, you do not want to find dor parcels unless the
    // click was actually on a pwd parcel that could be geocoded, because just running
    // getDorParcelsByLatLng changes the Deeds topic in the UI, and the click could have been
    // on the road
    // there is a callback after geocode to get dor parcels
    const activeParcelLayer = this.store.state.activeParcelLayer;
    // console.log('in handleMapClick, latlng:', latLng, 'activeParcelLayer:', activeParcelLayer);
    // this.dataManager.getParcelsByLatLng(latLng, activeParcelLayer);
    let parcelResponse = await this.dataManager.getParcelsByLatLng(latLng, activeParcelLayer);
    // console.log('handleMapClick after getParcelsByLatLng, parcelResponse:', parcelResponse);
    let processedParcel = this.dataManager.processParcels(false, parcelResponse, activeParcelLayer);

    if (!processedParcel) {
      return;
    }

    this.store.commit('setLastSearchMethod', 'reverseGeocode');
    this.store.commit('setClickCoords', latLng);
    this.store.commit('setGeocodeInput', null);

    this.dataManager.resetData();
    this.dataManager.resetShape();
    this.dataManager.removeShape();

    if (this.store.state.lastSearchMethod !== 'buffer search') {
      // console.log('in didGetParcels, removing BufferShape, this.store.state.lastSearchMethod:', this.store.state.lastSearchMethod);
      this.store.commit('setBufferShape', null);
    }

    const props = processedParcel.properties || {};
    const geocodeField = this.config.parcels[activeParcelLayer].geocodeField;
    const id = props[geocodeField];
    // console.log('props:', props);
    // if (id) this.router.routeToAddress(id);

    // since we definitely have a new parcel, and will attempt to geocode it:
    // 1. wipe out state data on other parcels
    // 2. attempt to replace

    // console.log('handleMapClick about to call geocode.fetch, id:', id);
    let aisResponse = await this.clients.geocode.fetch(id);
    // let aisResponse = await this.clients.geocode.fetch(props.ADDRESS);
    // console.log('after await aisResponse 1:', aisResponse);//, aisResponse.properties.opa_account_num);
    // if (aisResponse) {
    //   aisResponse.condo = false;
    // }

    if (!aisResponse) {
      // console.log('if !aisResponse is running, props.ADDRESS:', props.ADDRESS);
      aisResponse = await this.clients.condoSearch.fetch(props.ADDRESS);
    } else {
      // console.log('after await aisResponse 1.5:', aisResponse, 'aisResponse opa number:', aisResponse.properties.opa_account_num);
    }

    // console.log('after await aisResponse 2:', aisResponse, 'aisResponse opa number:', aisResponse.properties.opa_account_num);

    this.router.setRouteByGeocode();

    // console.log('after await aisResponse 3:', aisResponse, 'aisResponse opa number:', aisResponse.properties.opa_account_num);
    // console.log('this.store.state.bufferMode:', this.store.state.bufferMode);

    // handle if it is in buffer mode
    if (this.store.state.bufferMode) {
      await this.runBufferProcess(parcelResponse);
    } else {

      // after getting the parcel of the activeParcelLayer, check if there are
      // other parcel layers and if you clicked on anything in them

      // console.log('didGetParcels is wiping out the', otherParcelLayers, 'parcels in state');
      const otherParcelLayers = Object.keys(this.config.parcels || {});
      otherParcelLayers.splice(otherParcelLayers.indexOf(activeParcelLayer), 1);
      for (let otherParcelLayer of otherParcelLayers) {
        const configForOtherParcelLayer = this.config.parcels[otherParcelLayer];
        // console.log('for let otherParcelLayer of otherParcelLayers is running, configForOtherParcelLayer:', configForOtherParcelLayer);
        const otherMultipleAllowed = configForOtherParcelLayer.multipleAllowed;
        const otherMapregStuff = configForOtherParcelLayer.mapregStuff;

        // is tbis line necessary?
        this.dataManager.setParcelsInState(otherParcelLayer, otherMultipleAllowed, null, [], otherMapregStuff);

        let otherResponse = await this.dataManager.getParcelsByLatLng(latLng, otherParcelLayer, 'noFetch');
        this.dataManager.processParcels(false, otherResponse, otherParcelLayer);
      }
    }
    // console.log('after await aisResponse 4:', aisResponse, 'aisResponse opa number:', aisResponse.properties.opa_account_num);

    // this.dataManager.resetData();
    // console.log('getting to end of handleMapClick, calling fetchData, this.store.state.geocode.data.condo:', this.store.state.geocode.data.condo);
    // console.log('getting to end of handleMapClick, calling fetchData, this.store.state.geocode.data.condo:', this.store.state.geocode.data.condo, 'aisResponse opa:', aisResponse.properties.opa_account_num,'opa_account_num:', this.store.state.geocode.data.properties.opa_account_num);
    this.dataManager.fetchData();
  }

  async handleDrawnShape(state) {
    console.log('handleDrawnShape is running');
    let shape = this.store.state.drawShape;
    let changeCenter;

    if (!shape) {
      // let query = this.vueRouter.history.current.query;
      let query = this.vueRouter.currentRoute.query;
      // console.log('App.vue mounted is running, window.location.hash:', this.vueRouter);
      // this.introPage = false;
      // this.$store.commit('setIntroPage', false);
      let queryShape = query.shape;
      queryShape = queryShape.slice(2, queryShape.length-2);
      queryShape = queryShape.split('],[');
      let test = [];
      for (let point of queryShape) {
        test.push(point.split(','));
      }
      let _latlngs = [];
      for (let item of test) {
        let latlng = new L.LatLng(parseFloat(item[0]), parseFloat(item[1]));
        _latlngs.push(latlng);
      }
      shape = { _latlngs };
      changeCenter = true;
    }


    const parcels = [];
    let response = await this.dataManager.getParcelsByShape(shape, parcels);
    if(changeCenter === true) {
      // console.log('handleDrawnShape, response:', response.features[0].geometry.coordinates[0][0]);
      this.store.commit('setMapCenter', response.features[0].geometry.coordinates[0][0]);
    }
    const configForParcelLayer = this.config.parcels.pwd;
    const geocodeField = configForParcelLayer.geocodeField;
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcels), 1);
    const lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    // if (error) {
    //   if (configForParcelLayer.clearStateOnError) {
    //   }
    //   return;
    // }
    if (!response) {
      return;
    }

    const features = response.features;

    if (features.length === 0) {
      this.dataManager.resetData();
      this.resetGeocode();
      this.dataManager.clearOwnerSearch();
      this.store.commit('setShapeSearchData', null);
      this.store.commit('setParcelData', {});
      this.store.commit('setLastSearchMethod', 'geocode');
      this.store.commit('setBufferShape', null);
      this.store.commit('setShapeSearchStatus', 'error');
      return;
    } else if (features.length > 200) {
      // console.log('there are greater than 200 parcels');
      this.store.commit('setShapeSearchStatus', 'too many');
      this.dataManager.resetData();
      this.resetGeocode();
      this.dataManager.clearOwnerSearch();
      this.store.commit('setShapeSearchData', null);
      this.store.commit('setParcelData', {});
      this.store.commit('setLastSearchMethod', 'geocode');
      this.store.commit('setBufferShape', null);
      return;
    }

    this.dataManager.clearOwnerSearch();
    this.dataManager.resetData();
    // at this point there is definitely a feature or features - put it in state
    this.dataManager.setParcelsInState('pwd', true, null, features, false);
    // this.geocode(features);
    this.store.commit('setLastSearchMethod', 'shape search');
    this.dataManager.removeShape();
    // this.clearShapeSearch()
    this.dataManager.resetGeocodeOnly();

    this.router.setRouteByShapeSearch();
    // const didShapeSearch = this.didShapeSearch.bind(this);
    let shapeResponse = await this.clients.shapeSearch.fetch(features);
    // console.log('shapeResponse:', shapeResponse);
    this.dataManager.fetchData();
  }

  getParcelsByPoints(points) {
    this.dataManager.getParcelsByShape(points);
  }


  // MAJOR QUESTION - should all routing not be in datafetch?

  // TODO this may be entirely doing in mapboard, no reason for it here
  // in pvc Topic.vue there is also a function called handleTopicHeaderClick
  // it emits an event that mapboard's TopicPanel.vue sees
  // it also has a function called handleTopicHeaderClick
  // it calls this, so that this handles topic routing
  handleTopicHeaderClick(topic) {
    // console.log('Controller.handleTopicHeaderClick', topic);
    this.router.routeToTopic(topic);//.then(function(targetExists) {

    // scroll to top of topic header

    // get element
    const els = document.querySelectorAll(`[data-topic-key='${topic}']`);
    const el = els.length === 1 && els[0];

    // handle null el - this shouldn't happen, but just in case
    if (!el) {
      return;
    }

    Vue.nextTick(() => {
      // REVIEW this check is returning true even when the header el isn't
      // really visible, probbaly because of a timing issue. it works well
      // enough without it. commenting out for now.
      // const visible = this.isElementInViewport(el);

      // if (!visible) {
      el.scrollIntoView();
      // }
    });
  }

  goToDefaultAddress(address) {
    this.router.routeToAddress(address);
  }

}

function controllerMixin(Vue, opts) {
  // console.log('function controllerMixin is running, opts:', opts);
  const controller = new Controller(opts);

  Vue.mixin({
    created() {
      this.$controller = controller;
    },
  });
}

// export { Controller, controllerMixin }
export default controllerMixin;
export { Controller };
