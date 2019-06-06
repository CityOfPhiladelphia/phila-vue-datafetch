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

  appDidLoad() {
    // route once on load
    this.router.hashChanged();
  }

  test() {
    console.log('controller test is firing');
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

  handleSearchFormSubmit(value, searchCategory) {
    const input = value
    console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running, value:', value, 'searchCategory:', searchCategory, 'this:', this);

    this.store.commit('setGeocodeStatus', null);
    if (!searchCategory || searchCategory === 'address') {
      this.store.commit('setGeocodeInput', input);
    } else if (searchCategory === 'owner') {
      this.store.commit('setOwnerSearchInput', input);
    }
    this.store.commit('setShouldShowAddressCandidateList', false);
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
    }

    // tell router
    console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is about to call routeToAddress, input:', input, 'searchCategory.toLowerCase():', searchCategory.toLowerCase());
    if (!searchCategory || searchCategory.toLowerCase() === 'address') {
      this.router.routeToAddress(input, searchCategory.toLowerCase());
    } else if (searchCategory.toLowerCase() === 'owner') {
      console.log('searchCategory is owner');
      this.router.routeToOwner(input, searchCategory.toLowerCase());
    } else if (searchCategory.toLowerCase() === 'keyword') {
      console.log('searchCategory is keyword');
      this.router.routeToKeyword(input, searchCategory.toLowerCase());
    }
  }

  handleMapClick(e) {
    // console.log('handle map click', e, this);

    // TODO figure out why form submits via enter key are generating a map
    // click event and remove this
    if (e.originalEvent.keyCode === 13) {
      return;
    }
    this.store.commit('setLastSearchMethod', 'reverseGeocode');
    this.store.commit('setClickCoords', null);

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
    this.dataManager.getParcelsByLatLng(latLng, activeParcelLayer);
  }

  // util for making sure topic headers are visible after clicking on one
  // adapted from: https://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport/7557433#7557433
  // REVIEW this is returning true even when the topic header isn't visible,
  // probably because of a timing issue. it's good enough without this check for
  // now. commenting out.
  // isElementInViewport(el) {
  //   const rect = el.getBoundingClientRect();
  //
  //   // check visibility of each side of bounding rect
  //   const topVisible = rect.top >= 0;
  //   const leftVisible = rect.left >= 0;
  //   const bottomVisible = rect.bottom <= (
  //     window.innerHeight || document.documentElement.clientHeight
  //   );
  //   const rightVisible = rect.right <= (
  //     window.innerWidth || document.documentElement.clientWidth
  //   );
  //
  //   return (topVisible && leftVisible && bottomVisible && rightVisible);
  // }

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

  handleRefinePanelClick(selectedServices) {
    console.log('handleRefinePanelClick is running, selectedServices:', selectedServices);
    this.router.routeToServices(selectedServices)
  }

  goToDefaultAddress(address) {
    this.router.routeToAddress(address);
  }

  resetGeocode() {
    this.dataManager.resetGeocode();
  }

  routeToNoAddress() {
    this.router.routeToNoAddress();
  }
}

export default Controller;
