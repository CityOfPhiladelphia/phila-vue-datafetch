import { parse as parseUrl } from 'url';

class Router {
  constructor(opts) {
    const config = this.config = opts.config;
    this.store = opts.store;
    this.controller = opts.controller;
    this.dataManager = opts.dataManager;
    this.history = window.history;

    // check if the router should be silent (i.e. not update the url or listen
    // for hash changes)
    const silent = this.silent = !config.router || !config.router.enabled;

    // only listen for route changes if routing is enabled
    if (!silent) {
      window.onhashchange = this.hashChanged.bind(this);
    }
  }

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

  makeHash(address, topic) {
    // console.log('make hash', address, topic);

    // must have an address
    if (!address || address.length === 0) {
      return null;
    }

    let hash = `#/${encodeURIComponent(address)}`;
    if (topic) {
      hash += `/${topic}`;
    }

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
    // console.log('hashChanged is running, this.store.state.activeTopic:', this.store.state.activeTopic);
    const location = window.location;
    const hash = location.hash;

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
    let nextTopic;

    const modalKeys = this.config.modals || [];
    // console.log('pathComps:', pathComps, 'modalKeys:', modalKeys);
    if (modalKeys.includes(pathComps[0])) {
      // console.log('if pathComps[0] is true');
      this.routeToModal(pathComps[0]);
      return;
    }

    if (pathComps.length > 1) {
      nextTopic = decodeURIComponent(pathComps[1]);
    }

    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }

    this.routeToAddress(nextAddress);
    if (this.store.state.activeTopic || this.store.state.activeTopic === "") {
      if (this.config.topics.length) {
        this.routeToTopic(nextTopic);
      }
    }
  }

  routeToAddress(nextAddress, searchCategory) {
    // console.log('Router.routeToAddress', nextAddress);
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
    }
  }

  routeToOwner(nextOwner, searchCategory) {
    // console.log('Router.routeToAddress', nextAddress);
    if (nextOwner) {
      // check against current address
      // const prevOwner = this.getAddressFromState();

      // if the hash address is different, geocode
      // if (!prevAddress || nextAddress !== prevAddress) {
        // console.log('routeToAddress is calling datamanager.geocode(nextAddress):', nextAddress);
        this.dataManager.geocode(nextOwner, searchCategory);
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

  // this gets called when you click a topic header.
  routeToTopic(nextTopic, target) {
    // console.log('router.js routeToTopic is running');
    // check against active topic
    const prevTopic = this.store.state.activeTopic;

    if (!prevTopic || prevTopic !== nextTopic) {
      this.store.commit('setActiveTopic', nextTopic);

      if (this.store.state.map) {
        const prevBasemap = this.store.state.map.basemap || null;
        const nextTopicConfig = this.config.topics.filter(topic => {
          return topic.key === nextTopic;
        })[0] || {};
        const nextBasemap = nextTopicConfig.parcels;
        const nextImagery = nextTopicConfig.imagery;
        if (prevBasemap !== nextBasemap) {
          this.store.commit('setBasemap', nextTopicConfig.parcels);
        }
        if (nextImagery) {
          this.store.commit('setShouldShowImagery', true);
          this.store.commit('setImagery', nextImagery);
        }
      }
    }

    if (!this.silent) {
      const address = this.getAddressFromState();
      const nextHash = this.makeHash(address, nextTopic);
      const lastHistoryState = this.history.state;
      this.history.replaceState(lastHistoryState, null, nextHash);
    }
  }

  didGeocode() {
    const geocodeData = this.store.state.geocode.data;

    // make hash if there is geocode data
    // console.log('Router.didGeocode running - geocodeData:', geocodeData);
    if (geocodeData) {
      let address;

      if (geocodeData.street_address) {
        address = geocodeData.street_address;
      } else if (geocodeData.properties.street_address) {
        address = geocodeData.properties.street_address;
      }
      const topic = this.store.state.activeTopic;

      // REVIEW this is only pushing state when routing is turned on. but maybe we
      // want this to happen all the time, right?
      if (!this.silent) {
        // push state
        const nextHistoryState = {
          geocode: geocodeData
        };
        const nextHash = this.makeHash(address, topic);
        // console.log('nextHistoryState', nextHistoryState, 'nextHash', nextHash);
        this.history.pushState(nextHistoryState, null, nextHash);
      }
    } else {
      // wipe out hash if a geocode fails
      if (!this.silent) {
        this.history.pushState(null, null, '#');
      }
    }
  }
}

export default Router;
