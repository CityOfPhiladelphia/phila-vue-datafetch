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

  makeHash(firstRouteParameter, secondRouteParameter) {
    console.log('make hash, firstRouteParameter:', firstRouteParameter, 'secondRouteParameter:', secondRouteParameter);

    // must have an firstRouteParameter
    if (!firstRouteParameter || firstRouteParameter.length === 0) {
      return null;
    }

    let hash = `#/${encodeURIComponent(firstRouteParameter)}/`;
    if (secondRouteParameter) {
      if (Array.isArray(secondRouteParameter)) {
        console.log('secondRouteParameter is an Array');
        if (secondRouteParameter.length > 1) {
          console.log('secondRouteParameter is an Array and length is greater than 1')
          for (let [index, topicOrService] of secondRouteParameter.entries()) {
            console.log('topicOrService:', topicOrService, 'index:', index);
            hash += `${encodeURIComponent(topicOrService)}`
            if (index < secondRouteParameter.length - 1) {
              hash += `${encodeURIComponent(',')}`
            }
          }
        } else {
          console.log('secondRouteParameter is an Array and length is not greater than 1')
          hash += `${encodeURIComponent(secondRouteParameter)}`
        }
      } else {
        console.log('secondRouteParameter is not an array')
        hash += `${secondRouteParameter}`;
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
    const encodedFirstRouteParameter = pathComps[0];
    console.log('hash:', hash, 'pathComps:', pathComps, 'encodedFirstRouteParameter:', encodedFirstRouteParameter);

    // if there's no address, erase it
    if (!encodedFirstRouteParameter) {
      this.routeToModal('');
      this.dataManager.resetGeocode();
      return;
    }

    const firstRouteParameter = decodeURIComponent(encodedFirstRouteParameter);
    let secondRouteParameter;

    const modalKeys = this.config.modals || [];
    // console.log('pathComps:', pathComps, 'modalKeys:', modalKeys);
    if (modalKeys.includes(pathComps[0])) {
      // console.log('if pathComps[0] is true');
      this.routeToModal(pathComps[0]);
      return;
    }

    if (pathComps.length > 1) {
      secondRouteParameter = decodeURIComponent(pathComps[1]);
    }

    console.log('in hashChanged, firstRouteParameter:', firstRouteParameter, 'secondRouteParameter:', secondRouteParameter);
    let nextAddress;
    let nextKeyword;
    if (firstRouteParameter.includes('addr ')) {
      console.log('in hashChanged, includes addr')
      nextAddress = firstRouteParameter;
      this.store.commit('setSearchType', 'address');
    } else if (firstRouteParameter.includes('kw ')) {
      console.log('in hashChanged, includes kw')
      nextKeyword = firstRouteParameter.replace('kw ', '');
      this.store.commit('setSearchType', 'keyword');
    }


    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }

    if (nextAddress && nextAddress !== 'addr noaddress') {
      this.routeToAddress(nextAddress);
    }

    if (nextKeyword) {
      // console.log('hashChanged sending keyWords to store, values:', values);
      this.routeToKeyword(nextKeyword);
    }

    if (this.store.state.activeTopic || this.store.state.activeTopic === "") {
      if (this.config.topics) {
        if (this.config.topics.length) {
          this.routeToTopic(secondRouteParameter);
        }
      }
    }

    if (this.store.state.selectedServices) {
      let secondRouteParameterArray;
      if (secondRouteParameter) {
        secondRouteParameterArray = secondRouteParameter.split(',');
      } else {
        secondRouteParameterArray = []
      }
      console.log('secondRouteParameterArray:', secondRouteParameterArray)
      this.store.commit('setSelectedServices', secondRouteParameterArray);
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

  // this is for routing to a first parameter OTHER than an address
  // it inherits and passes the first parameter, it handles entering a string
  // it is guaranteed that the second parameter is "selectedServices"
  routeToKeyword(nextKeywords) {
    console.log('in router.js routeToKeyword, nextKeywords:', nextKeywords);
    let values = nextKeywords.split(',');
    console.log('in routeToKeyword values:', values);
    this.store.commit('setSelectedKeywords', values);

    if (!this.silent) {
      nextKeywords = 'kw ' + nextKeywords

      // creating next hash
      const nextHash = this.makeHash(nextKeywords, this.store.state.selectedServices);

      const lastHistoryState = this.history.state;
      this.history.replaceState(lastHistoryState, null, nextHash);
    }
  }

  // this is for routing to a second parameter
  // it is guaranteed that the first parameter is "address" or "keywords"
  // it inherits and passes the second parameter
  // routeToServices(nextServices) {
  //   const searchType = this.store.state.searchType;
  //   console.log('routeToServices is running, nextServices:', nextServices, 'searchType:', searchType);
  //   if (!this.silent) {
  //     // getting potential first parameters
  //     let address = this.getAddressFromState();
  //     if (!address) {
  //       address='noaddress'
  //     }
  //     address = 'addr ' + address;
  //     console.log('in routeToServices, address:', address);

  //     let keywords = 'kw '+ this.store.state.selectedKeywords.join(', ');

  //     // creating next hash
  //     let nextHash;
  //     if (searchType === 'address') {
  //       nextHash = this.makeHash(address, nextServices);
  //     } else if (searchType === 'keyword') {
  //       nextHash = this.makeHash(keywords, nextServices);
  //     }

  //     const lastHistoryState = this.history.state;
  //     this.history.replaceState(lastHistoryState, null, nextHash);
  //   }
  // }

  configForBasemap(key) {
    return this.config.map.basemaps[key];
  }

  routeToModal(selectedModal) {
    console.log('routeToModal is running, selectedModal:', selectedModal);
    this.store.commit('setDidToggleModal', selectedModal);
  }

  // this gets called when you click a topic header.
  routeToTopic(nextTopic, target) {
    console.log('router.js routeToTopic is running, nextTopic:', nextTopic, 'target:', target);
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

  // this is almost just the same thing as any of the routeTo... functions above
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
        if (topic) {
          nextHash = this.makeHash(address, topic);
        } else {
          nextHash = this.makeHash(address, selectedServices);
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
