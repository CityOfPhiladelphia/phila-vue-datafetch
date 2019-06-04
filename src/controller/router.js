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

  activeParcelLayer() {
    if (this.config.map) {
      return this.activeTopicConfig().parcels || this.config.map.defaultBasemap;
    } else {
      return this.activeTopicConfig().parcels;
    }
  }

  makeHash(addressOrKeywords, topicOrServices) {
    console.log('make hash, addressOrKeywords:', addressOrKeywords, 'topicOrServices:', topicOrServices);

    // must have an addressOrKeywords
    if (!addressOrKeywords || addressOrKeywords.length === 0) {
      return null;
    }

    let hash = `#/${encodeURIComponent(addressOrKeywords)}/`;
    if (topicOrServices) {
      if (Array.isArray(topicOrServices)) {
        console.log('topicOrServices is an Array');
        if (topicOrServices.length > 1) {
          console.log('topicOrServices is an Array and length is greater than 1')
          for (let [index, topicOrService] of topicOrServices.entries()) {
            console.log('topicOrService:', topicOrService, 'index:', index);
            hash += `${encodeURIComponent(topicOrService)}`
            if (index < topicOrServices.length - 1) {
              hash += `${encodeURIComponent(',')}`
            }
          }
        } else {
          console.log('topicOrServices is an Array and length is not greater than 1')
          hash += `${encodeURIComponent(topicOrServices)}`
        }
      } else {
        console.log('topicOrServices is not an array')
        hash += `${topicOrServices}`;
      }
    }

    return hash;
  }

  getAddressFromState() {
    // TODO add an address getter fn to config so this isn't ais-specific
    const geocodeData = this.store.state.geocode.data || {};
    const props = geocodeData.properties || {};
    console.log('getAddressFromState is running, geocodeData:', geocodeData, 'props:', props);
    if (geocodeData.street_address) {
      return geocodeData.street_address;
    } else if (props.street_address) {
      return props.street_address;
    }
  }

  hashChanged() {
    console.log('hashChanged is running, this.store.state.activeTopic:', this.store.state.activeTopic);
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
    const addressOrKeywordComp = pathComps[0];
    console.log('hash:', hash, 'pathComps:', pathComps, 'addressOrKeywordComp:', addressOrKeywordComp);

    // if there's no address, erase it
    if (!addressOrKeywordComp) {
      this.routeToModal('');
      this.dataManager.resetGeocode();
      return;
    }

    const nextAddressOrKeyword = decodeURIComponent(addressOrKeywordComp);
    let nextTopicOrServices;

    const modalKeys = this.config.modals || [];
    // console.log('pathComps:', pathComps, 'modalKeys:', modalKeys);
    if (modalKeys.includes(pathComps[0])) {
      // console.log('if pathComps[0] is true');
      this.routeToModal(pathComps[0]);
      return;
    }

    if (pathComps.length > 1) {
      nextTopicOrServices = decodeURIComponent(pathComps[1]);
    }

    console.log('in hashChanged, nextAddressOrKeyword:', nextAddressOrKeyword, 'nextTopicOrServices:', nextTopicOrServices);
    let nextAddress;
    let nextKeyword;
    if (nextAddressOrKeyword.includes('addr ')) {
      console.log('in hashChanged, includes addr')
      // nextAddress = nextAddressOrKeyword.replace('addr ', '');
      nextAddress = nextAddressOrKeyword;
      this.store.commit('setSearchType', 'address');
    } else if (nextAddressOrKeyword.includes('kw ')) {
      console.log('in hashChanged, includes kw')
      nextKeyword = nextAddressOrKeyword.replace('kw ', '');
      // nextKeyword = nextAddressOrKeyword;
      this.store.commit('setSearchType', 'keyword');
    }


    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }

    if (nextAddress && nextAddress !== 'addr noaddress') {
      this.routeToAddress(nextAddress);
    }

    if (nextKeyword) {
      // let values = nextKeyword.split(',');
      // console.log('hashChanged sending keyWords to store, values:', values);
      // this.store.commit('setSelectedKeywords', values);
      this.routeToKeyword(nextKeyword);
    }

    if (this.store.state.activeTopic || this.store.state.activeTopic === "") {
      if (this.config.topics) {
        if (this.config.topics.length) {
          this.routeToTopic(nextTopicOrServices);
        }
      }
    }

    if (this.store.state.selectedServices) {
      let nextTopicOrServicesArray;
      if (nextTopicOrServices) {
        nextTopicOrServicesArray = nextTopicOrServices.split(',');
      } else {
        nextTopicOrServicesArray = []
      }
      console.log('nextTopicOrServicesArray:', nextTopicOrServicesArray)
      this.store.commit('setSelectedServices', nextTopicOrServicesArray);
    }
  }

  routeToAddress(nextAddress, searchCategory) {
    console.log('Router.routeToAddress, nextAddress:', nextAddress);
    if (nextAddress) {
      nextAddress = nextAddress.replace('addr ', '');
      // check against current address
      const prevAddress = this.getAddressFromState();

      // if the hash address is different, geocode
      if (!prevAddress || nextAddress !== prevAddress) {
        this.dataManager.geocode(nextAddress, searchCategory);
      }
    }
  }

  routeToNoAddress() {
    const nextHash = this.makeHash('addr noaddress', this.store.state.selectedServices);
    const lastHistoryState = this.history.state;
    this.history.replaceState(lastHistoryState, null, nextHash);
  }

  routeToOwner(nextOwner, searchCategory) {
    if (nextOwner) {
      this.dataManager.geocode(nextOwner, searchCategory);
    }
  }

  routeToKeyword(nextKeywords, searchCategory) {
    console.log('in router.js routeToKeyword, nextKeywords:', nextKeywords, 'searchCategory:', searchCategory);
    if (!this.silent) {
      let values = nextKeywords.split(',');
      console.log('routeToKeyword values:', values);
      this.store.commit('setSelectedKeywords', values);
      nextKeywords = 'kw ' + nextKeywords
      const nextHash = this.makeHash(nextKeywords, this.store.state.selectedServices);
      const lastHistoryState = this.history.state;
      this.history.replaceState(lastHistoryState, null, nextHash);
    }
  }

  routeToServices(nextServices) {
    const searchType = this.store.state.searchType;
    console.log('routeToServices is running, nextServices:', nextServices, 'searchType:', searchType);
    if (!this.silent) {
      let address = this.getAddressFromState();
      if (!address) {
        address='noaddress'
      }
      let keywords = 'kw '+ this.store.state.selectedKeywords.join(', ');
      console.log('in routeToServices, address:', address)
      address = 'addr ' + address;
      let nextHash;
      if (searchType === 'address') {
        nextHash = this.makeHash(address, nextServices);
      } else if (searchType === 'keyword') {
        nextHash = this.makeHash(keywords, nextServices);
      }
      const lastHistoryState = this.history.state;
      this.history.replaceState(lastHistoryState, null, nextHash);
    }
  }

  configForBasemap(key) {
    return this.config.map.basemaps[key];
  }

  routeToModal(selectedModal) {
    console.log('routeToModal is running, selectedModal:', selectedModal);
    this.store.commit('setDidToggleModal', selectedModal);
  }

  // this gets called when you click a topic header.
  routeToTopic(nextTopic, target) {
    // console.log('router.js routeToTopic is running');
    // check against active topic
    const prevTopic = this.store.state.activeTopic;

    if (!prevTopic || prevTopic !== nextTopic) {
      this.store.commit('setActiveTopic', nextTopic);
      this.store.commit('setActiveParcelLayer', this.activeParcelLayer());

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
      let address = this.getAddressFromState();
      address = 'addr ' + address;
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

      if (this.config.router.returnToDefaultTopicOnGeocode) {
        this.store.commit('setActiveTopic', this.config.defaultTopic);
      }

      const topic = this.store.state.activeTopic;
      const selectedServices = this.store.state.selectedServices;

      // REVIEW this is only pushing state when routing is turned on. but maybe we
      // want this to happen all the time, right?
      if (!this.silent) {
        // push state
        const nextHistoryState = {
          geocode: geocodeData
        };
        let nextHash;
        address = 'addr ' + address;
        if (selectedServices) {
          nextHash = this.makeHash(address, selectedServices);
        } else {
          nextHash = this.makeHash(address, topic);
        }
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
