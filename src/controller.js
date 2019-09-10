/*
The Controller handles events from the UI that have some effect on routing or
data fetching. It is a "thin" class that mostly proxies events to the router and
data manager, and facilitates communication between them.
*/

import Vue from 'vue';
import Router from './router';
import DataManager from './data-manager';

import { query as Query } from 'esri-leaflet';

import {
  GeocodeClient,
  OwnerSearchClient,
  HttpClient,
  EsriClient
} from './clients';

// console.log('controller.js is being read')

class Controller {
  constructor(opts) {
    // console.log('in Controller constructor, opts:', opts);
    const store = this.store = opts.store;
    const config = this.config = opts.config;
    // const eventBus = this.eventBus = opts.eventBus;
    this.history = window.history;

    // the router and data manager need a ref to the controller
    opts.controller = this;

    // create data manager
    const dataManager = this.dataManager = new DataManager(opts);

    // create router
    opts.dataManager = dataManager;
    this.router = new Router(opts);

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

  /*
  EVENT HANDLERS
  */

  appDidLoad() {
    // console.log('pvd appDidLoad is running');
    // route once on load
    this.router.hashChanged();
  }

  getMoreRecords(dataSource, highestPageRetrieved) {
    this.dataManager.fetchMoreData(dataSource, highestPageRetrieved);
  }

  filterInputSubmit(value, process, searchCategory) {
    console.log('controller filterInputSubmit is running, value:', value, 'process:', process);
    if (process === 'mapboard') {
      this.handleSearchFormSubmit(value);
    } else {
      this.handleConfigurableInputSubmit(value, searchCategory);
    }
  }

  handleConfigurableInputSubmit(value, searchCategory) {
    console.log('controller handleConfigurableInputSubmit is running, value:', value, 'searchCategory:', searchCategory);
    if (searchCategory === 'address') {
      this.handleSearchFormSubmit(value, searchCategory);
    } else if (searchCategory === 'owner') {
      console.log('searchCategory is owner');
      this.handleSearchFormSubmit(value, searchCategory);
    }
  }

  initializeStatuses(input, searchCategory) {
    this.store.commit('setGeocodeStatus', null);
    if (!searchCategory || searchCategory === 'address') {
      this.store.commit('setGeocodeInput', input);
    } else if (searchCategory === 'owner') {
      this.store.commit('setOwnerSearchInput', input);
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
      let payload;
      // pwd
      if (!multipleAllowed) {
        payload = {
          parcelLayer: parcelLayer,
          multipleAllowed,
          data: null
        }
      // dor
      } else {
        payload = {
          parcelLayer: parcelLayer,
          multipleAllowed,
          data: [],
          status: null,
          activeParcel: null,
          activeAddress: null,
          activeMapreg: null
        }
      }
      // update state
      this.store.commit('setParcelData', payload);
      // console.log('initializeStatuses is running');
    }
  }

  async handleSearchFormSubmit(value, searchCategory) {
    console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running, value:', value, 'searchCategory:', searchCategory);
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running, value:', value, 'searchCategory:', searchCategory, 'this:', this);
    this.dataManager.resetData();

    this.initializeStatuses(value, searchCategory);
    // console.log('after await initializeStatuses is running');

    // TODO rename to aisResponse
    let aisResponse = await this.clients.geocode.fetch(value)
    console.log('after await aisResponse:', aisResponse)//, 'this.clients:', this.clients);

    this.router.setRouteByGeocode();

    // TODO
    const {activeParcelLayer, lastSearchMethod} = this.store.state;
    const parcelLayers = Object.keys(this.config.parcels || {});

    // if it is a dor parcel query, and the geocode fails, coordinates can still be used
    // to get dor parcels which are not in ais
    // set coords to the ais coords OR the click if there is no ais result

    // all of this happens whether geocode failed or succeeded
    // search box or onload - get parcels by id
    // (unless it fails and you are allowed to get them by LatLng on failure)
    let theParcels = [];
    let response;
    if (!aisResponse) { return }

    console.log('right before loop');

    // loop through the parcels, and get them by their ids
    for (let parcelLayer of parcelLayers) {
      console.log('in loop, parcelLayer:', parcelLayer);
      const configForParcelLayer = this.config.parcels[parcelLayer];
      const parcelIdInGeocoder = configForParcelLayer.parcelIdInGeocoder
      const parcelId = aisResponse.properties[parcelIdInGeocoder];
      if (parcelId && parcelId.length > 0) {
        response = await this.dataManager.getParcelsById(parcelId, parcelLayer);
        theParcels.push(response);
        // TODO - catch error before this if necessary
      } else {
        if (configForParcelLayer.getByLatLngIfIdFails) {
          // console.log(parcelLayer, 'Id failed - had to get by LatLng')
          console.log('in if lastSearchMethod === geocode, parcelLayer:', parcelLayer);
          // TODO update getParcelByLAtLng to return parcels
          this.dataManager.getParcelsByLatLng(latlng, parcelLayer);
        }
      }
      this.dataManager.processParcels(false, response, parcelLayer);
      // this.dataManager.resetData();
      this.dataManager.fetchData();
    }
    console.log('end of handleSearchFormSubmit');
  }

  async handleMapClick(e) {
    console.log('handle map click', e, this);

    // TODO figure out why form submits via enter key are generating a map
    // click event and remove this
    if (e.originalEvent.keyCode === 13) {
      return;
    }
    this.store.commit('setLastSearchMethod', 'reverseGeocode');
    // this.store.commit('setClickCoords', null);

    // get parcels that intersect map click xy
    const latLng = e.latlng;
    this.store.commit('setClickCoords', latLng);
    this.store.commit('setGeocodeInput', null);

    // if click is on a topic with pwd parcels, you do not want to find dor parcels unless the
    // click was actually on a pwd parcel that could be geocoded, because just running
    // getDorParcelsByLatLng changes the Deeds topic in the UI, and the click could have been
    // on the road
    // there is a callback after geocode to get dor parcels
    const activeParcelLayer = this.store.state.activeParcelLayer;
    // console.log('in handleMapClick, latlng:', latLng, 'activeParcelLayer:', activeParcelLayer);
    // this.dataManager.getParcelsByLatLng(latLng, activeParcelLayer);
    let response = await this.dataManager.getParcelsByLatLng(latLng, activeParcelLayer);
    console.log('handleMapClick after getParcelsByLatLng, response:', response);
    let processedParcel = this.dataManager.processParcels(false, response, activeParcelLayer);

    if (!processedParcel) {
      return;
    }

    this.dataManager.resetData();

    const props = processedParcel.properties || {};
    const geocodeField = this.config.parcels[activeParcelLayer].geocodeField;
    const id = props[geocodeField];
    // if (id) this.router.routeToAddress(id);

    // since we definitely have a new parcel, and will attempt to geocode it:
    // 1. wipe out state data on other parcels
    // 2. attempt to replace

    let aisResponse = await this.clients.geocode.fetch(id)
    console.log('after await aisResponse:', aisResponse);

    this.router.setRouteByGeocode();

    // after getting the parcel of the activeParcelLayer, check if there are
    // other parcel layers and if you clicked on anything in them

    // console.log('didGetParcels is wiping out the', otherParcelLayers, 'parcels in state');
    const otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(activeParcelLayer), 1);
    for (let otherParcelLayer of otherParcelLayers) {
      // console.log('for let otherParcelLayer of otherParcelLayers is running');
      const configForOtherParcelLayer = this.config.parcels[otherParcelLayer];
      const otherMultipleAllowed = configForOtherParcelLayer.multipleAllowed;

      // is tbis line necessary?
      this.dataManager.setParcelsInState(otherParcelLayer, otherMultipleAllowed, null, []);

      let otherResponse = await this.dataManager.getParcelsByLatLng(latLng, otherParcelLayer, 'noFetch');
      this.dataManager.processParcels(false, otherResponse, otherParcelLayer);
    }

    // this.dataManager.resetData();
    this.dataManager.fetchData();
  }


  // TODO this may be entirely doing in mapboard, no reason for it here
  // MAJOR QUESTION - should all routing not be in datafetch?
  handleTopicHeaderClick(topic) {
    // console.log('Controller.handleTopicHeaderClick', topic);
    this.router.routeToTopic(topic);//.then(function(targetExists) {

    /*
    scroll to top of topic header
    */

    // get element
    const els = document.querySelectorAll(`[data-topic-key='${topic}']`);
    const el = els.length === 1 && els[0];

    // handle null el - this shouldn't happen, but just in case
    if (!el) return;

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
  const controller = new Controller(opts);

  Vue.mixin({
    created() {
      this.$controller = controller;
    }
  });
}

// export { Controller, controllerMixin }
export default controllerMixin
export { Controller }
