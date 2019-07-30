/*
The Controller handles events from the UI that have some effect on routing or
data fetching. It is a "thin" class that mostly proxies events to the router and
data manager, and facilitates communication between them.
*/

import Vue from 'vue';
import Router from './router';
import DataManager from './data-manager';

class Controller {
  constructor(opts) {
    const store = this.store = opts.store;
    const config = this.config = opts.config;
    const vueRouter = this.vueRouter = opts.router;
    // const eventBus = this.eventBus = opts.eventBus;
    this.history = window.history;

    // the router and data manager need a ref to the controller
    opts.controller = this;

    // create data manager
    const dataManager = this.dataManager = new DataManager(opts);

    // create router
    opts.dataManager = dataManager;
    this.router = new Router(opts);
  }

  /*
  EVENT HANDLERS
  */

  activeFeatureChange(){
    this.dataManager.fetchRowData();
  }

  appDidLoad() {
    // route once on load
    // console.log('controller appDidLoad is running')
    this.router.hashChanged();
  }

  getMoreRecords(dataSource, highestPageRetrieved) {
    this.dataManager.fetchMoreData(dataSource, highestPageRetrieved);
  }

  filterInputSubmit(value, process, searchCategory) {
    // console.log('controller filterInputSubmit is running, value:', value, 'process:', process);
    if (process === 'mapboard') {
      this.handleSearchFormSubmit(value);
    } else {
      this.handleConfigurableInputSubmit(value, searchCategory);
    }
  }

  handleSearchFormSubmit(value, searchCategory) {
    const input = value
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running', value, this);

    this.dataManager.clearOwnerSearch();
    this.dataManager.clearShapeSearch();

    this.store.commit('setGeocodeStatus', null);
    this.store.commit('setGeocodeInput', input);

    this.store.commit('setShouldShowAddressCandidateList', false);
    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }
    if (this.store.state.clickCoords) {
      this.store.commit('setClickCoords', null);
    }

    // clear out state
    const parcelLayer = Object.keys(this.config.parcels || {});
    let payload = {
      parcelLayer: parcelLayer,
      data: null
    }
    // update state
    this.store.commit('setParcelData', payload);

    // tell router
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is about to call routeToAddress, input:', input);
    this.router.routeToAddress(input, searchCategory);
  }

  handleMapClick(e) {
    // console.log('handle map click', e, this);
    // if (this.store.state.bufferMode) {
    //   console.log('handleMapClick')
    //   // this.store.commit('setBufferMode', false);
    //   // this.dataManager
    // } else {
      // TODO figure out why form submits via enter key are generating a map
      // click event and remove this
      if (e.originalEvent.keyCode === 13) {
        return;
      }
      // commented this out so that it does not delete table on street click
      // this.store.commit('setLastSearchMethod', 'reverseGeocode');
      this.store.commit('setClickCoords', null);

      // get parcels that intersect map click xy
      const latLng = e.latlng;
      this.store.commit('setClickCoords', latLng);
      this.store.commit('setGeocodeInput', null);

      const parcels = this.store.state.parcels;
      // console.log('in handleMapClick, latlng:', latLng, 'parcels:', parcels);
      this.dataManager.getParcelsByLatLng(latLng, parcels);
    // }
  }
  getParcelsByDrawnShape(state) {
    const shape = this.store.state.drawShape;
    const parcels = [];
    this.dataManager.getParcelsByShape(shape, parcels);
  }
  getParcelsByPoints(points) {
    this.dataManager.getParcelsByShape(points);
  }
  geocodeOwnerSearch(state) {
    // console.log("ownerSearch data:", this.store.state.ownerSearch.data);
    const ids = this.store.state.ownerSearch.data.map(item => item.properties.pwd_parcel_id);

    let feature = this.dataManager.getParcelsById(ids, 'pwd');

    if( feature.response !== undefined) {
      this.store.commit('setGeocodeData', feature.response);
    }
  }

  goToDefaultAddress(address) {
    this.router.routeToAddress(address);
  }
}

export default Controller;
