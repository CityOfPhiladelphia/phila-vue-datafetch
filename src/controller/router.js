import { parse as parseUrl } from 'url';

class Router {
  constructor(opts) {
    const config = this.config = opts.config;
    this.store = opts.store;
    this.controller = opts.controller;
    this.dataManager = opts.dataManager;
    this.history = window.history;
    this.vueRouter = opts.router;

    // check if the router should be silent (i.e. not update the url or listen
    // for hash changes)
    const silent = this.silent = !config.router || !config.router.enabled;

    // only listen for route changes if routing is enabled
    if (!silent) {
      window.onhashchange = this.hashChanged.bind(this);
    }
  }

  makeHash(address) {
    // console.log('make hash', address);

    // must have an address
    if (!address || address.length === 0) {
      return null;
    }
    let hash = `#/${encodeURIComponent(address)}`;
    return hash;
  }

  getAddressFromState() {
    // TODO add an address getter fn to config so this isn't ais-specific
    const geocodeData = this.store.state.geocode.data || {};
    const props = geocodeData.properties || {};
    if (geocodeData.street_address) {
      return geocodeData.street_address;
    } else if (props.street_address) {
      return props.street_address;
    }
  }

  hashChanged() {
    const location = window.location;
    const hash = location.hash;

    console.log('hashChanged is running, hash:', hash);

    // parse url
    const comps = parseUrl(location.href);
    const query = comps.query;

    // TODO handle ?search entry point
    // if (query && query.search) {
    // }

    // parse path
    const pathComps = hash.split('/').splice(1);
    const addressComp = pathComps[0];

    // if there's no address, erase it
    if (!addressComp) {
      this.routeToModal('');
      this.dataManager.resetGeocode();
      return;
    }

    const nextAddress = decodeURIComponent(addressComp);

    const modalKeys = this.config.modals || [];
    // console.log('pathComps:', pathComps, 'modalKeys:', modalKeys);
    if (modalKeys.includes(pathComps[0])) {
      // console.log('if pathComps[0] is true');
      this.routeToModal(pathComps[0]);
      return;
    }

    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }
  }

  routeToAddress(nextAddress, searchCategory) {
    console.log('Router.routeToAddress, this.vueRouter:', this.vueRouter, 'nextAddress:', nextAddress, 'searchCategory:', searchCategory);
    if (nextAddress) {
      // check against current address
      const prevAddress = this.getAddressFromState();

      // if the hash address is different, geocode
      if (!prevAddress || nextAddress !== prevAddress) {
        // console.log('routeToAddress is calling datamanager.geocode(nextAddress):', nextAddress);
        this.dataManager.geocode(nextAddress, searchCategory);
        // this.dataManager.geocode(nextAddress, 'address')
                        // .then(this.didGeocode.bind(this));
      }
    } else {
      this.dataManager.resetData()
      this.dataManager.resetGeocode()
      this.store.commit('setLastSearchMethod', 'geocode');
    }
  }

  routeToOwner(nextOwner, searchCategory) {
    console.log('Router.routeToOwner', nextOwner);
    if (nextOwner) {
      // check against current address
      // const prevOwner = this.getAddressFromState();

      // if the hash address is different, geocode
      // if (!prevAddress || nextAddress !== prevAddress) {
        // console.log('routeToAddress is calling datamanager.geocode(nextAddress):', nextAddress);
        this.dataManager.geocode(nextOwner, searchCategory);
        //console.log(this.dataManager.geocode(nextOwner, searchCategory))
        // this.dataManager.geocode(nextOwner, 'owner')
                        // .then(this.didGeocode.bind(this));
      // }
    }
  }

  configForBasemap(key) {
    return this.config.map.basemaps[key];
  }

  routeToModal(selectedModal) {
    // console.log('routeToModal is running, selectedModal:', selectedModal);
    this.store.commit('setDidToggleModal', selectedModal);
  }

  didOwnerSearch() {
    console.log('Router.didOwnerSearch is running, this.vueRouter:', this.vueRouter);
    const ownerInput = this.store.state.ownerSearch.input;
    this.vueRouter.push({ query: { ...this.vueRouter.query, ...{ 'owner': ownerInput } }});
  }

  didShapeSearch() {
    const shapeInput = this.store.state.shapeSearch.input;
    console.log('Router.didShapeSearch is running, shapeInput:', shapeInput);
    // only run this if the shape is in the store (which it will not be if it is created from the route)
    if (shapeInput) {
      let shape = '[[';
      var i;
      for (i=0; i < shapeInput.length - 1; i++) {
        shape += shapeInput[i].lat.toFixed(5) + ',' + shapeInput[i].lng.toFixed(5) + '],[';
      }
      shape += shapeInput[shapeInput.length - 1].lat.toFixed(5) + ',' + shapeInput[shapeInput.length - 1].lng.toFixed(5) + ']]'

      console.log('shape:', shape)

      this.vueRouter.push({ query: {shape} });
    }
  }

  didGeocode() {
    const geocodeData = this.store.state.geocode.data;

    // make hash if there is geocode data
    console.log('Router.didGeocode, this.vueRouter:', this.vueRouter, 'geocodeData:', geocodeData, 'this.$route:', this.$route);
    if (geocodeData) {
      let address;

      if (geocodeData.street_address) {
        address = geocodeData.street_address;
      } else if (geocodeData.properties.street_address) {
        address = geocodeData.properties.street_address;
      }

      // REVIEW this is only pushing state when routing is turned on. but maybe we
      // want this to happen all the time, right?
      if (!this.silent) {
        // push state
        if (this.store.state.bufferMode) {
          this.vueRouter.push({ query: { ...this.vueRouter.query, ...{ 'buffer': address } }});
        } else {
          this.vueRouter.push({ query: { ...this.vueRouter.query, ...{ 'address': address } }});
        }
        // const nextHistoryState = {
        //   geocode: geocodeData
        // };
        // const nextHash = this.makeHash(address);
        // // console.log('nextHistoryState', nextHistoryState, 'nextHash', nextHash);
        // this.history.pushState(nextHistoryState, null, nextHash);
      }
    } else {
      // wipe out hash if a geocode fails
      if (!this.silent) {
        // this.history.pushState(null, null, '#');
      }
    }
  }
}

export default Router;
