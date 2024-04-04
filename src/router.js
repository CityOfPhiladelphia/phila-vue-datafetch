// import { parse as parseUrl } from 'url';

class Router {
  constructor(opts) {
    const config = this.config = opts.config;
    this.store = opts.store;
    this.controller = opts.controller;
    this.dataManager = opts.dataManager;
    this.history = window.history;
    this.vueRouter = opts.router;

    this.topics = [];
    if (this.config.topics) {
      for (let topic of this.config.topics) {
        this.topics.push(topic.key);
      }
    }

    // check if the router should be silent (i.e. not update the url or listen
    // for hash changes)
    const silent = this.silent = !config.router || !config.router.enabled;
    // console.log('Router constructor, opts:', opts, 'silent:', silent);

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
    if (this.config.parcels) {
      return this.activeTopicConfig().parcels || Object.keys(this.config.parcels)[0];
    }
    return null;
  }

  makeHash(firstRouteParameter, secondRouteParameter) {
    console.log('make hash, firstRouteParameter:', firstRouteParameter, 'secondRouteParameter:', secondRouteParameter);

    // must have an firstRouteParameter
    if (!firstRouteParameter || firstRouteParameter.length === 0) {
      return null;
    }

    let hash = `${encodeURIComponent(firstRouteParameter)}/`;
    // let hash = `#/${encodeURIComponent(firstRouteParameter)}/`;
    if (secondRouteParameter) {
      if (Array.isArray(secondRouteParameter)) {
        // console.log('secondRouteParameter is an Array');
        if (secondRouteParameter.length > 1) {
          // console.log('secondRouteParameter is an Array and length is greater than 1');
          for (let [ index, topicOrService ] of secondRouteParameter.entries()) {
            // console.log('topicOrService:', topicOrService, 'index:', index);
            hash += `${encodeURIComponent(topicOrService)}`;
            if (index < secondRouteParameter.length - 1) {
              hash += `${encodeURIComponent(',')}`;
            }
          }
        } else {
          // console.log('secondRouteParameter is an Array and length is not greater than 1');
          hash += `${encodeURIComponent(secondRouteParameter)}`;
        }
      } else {
        // console.log('secondRouteParameter is not an array');
        hash += `${secondRouteParameter}`;
      }
    }

    return hash;
  }

  getAddressFromState() {
    // TODO add an address getter fn to config so this isn't ais-specific
    const geocodeData = this.store.state.geocode.data || {};
    const props = geocodeData.properties || {};
    let address;
    if (geocodeData.street_address) {
      address = geocodeData.street_address;
    } else if (props.street_address) {
      address = props.street_address;
    }
    console.log('getAddressFromState is running, address:', address, 'geocodeData:', geocodeData, 'props:', props);
    return address;
  }

  hashChanged() {
    const location = window.location;
    let hash = location.pathname;
    console.log('hashChanged is running, location:', location, 'hash:', hash, 'this.store.state.activeTopic:', this.store.state.activeTopic);

    // parse url
    // const comps = parseUrl(location.href);
    const comps = location.href;
    const query = comps.query;

    // TODO handle ?search entry point
    // if (query && query.search) {
    // }

    let publicPath = '';
    if (this.config.publicPath) {
      publicPath = this.config.publicPath;
    }
    // if (process.env.VUE_APP_PUBLIC_PATH) {
    //   publicPath = process.env.VUE_APP_PUBLIC_PATH;
    // }

    console.log('pvd router.js publicPath 1:', publicPath, 'hash:', hash);
    if (publicPath) {
      hash = hash.replace(publicPath, '');
    }
    console.log('pvd router.js publicPath 2:', publicPath, 'hash:', hash);

    // parse path
    const pathComps = hash.split('/');//.splice(0);
    if (pathComps[0] == '') {
      pathComps.splice(0, 1);
    }
    console.log('hashChanged pathComps:', pathComps);

    let encodedFirstRouteParameter;
    if (pathComps.length) {
      encodedFirstRouteParameter = pathComps[0].replace('?address=', '').replace('?owner=', '').replace('?block=', '');
    }
    // console.log('hash:', hash, 'pathComps:', pathComps, 'encodedFirstRouteParameter:', encodedFirstRouteParameter);

    if (encodedFirstRouteParameter === 'maintenance') {
      // this.routeToMaintenance();
      return;
    }

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

    if (secondRouteParameter !== "undefined") {
      if (!this.store.state.activeTopic) {
        this.store.commit('setActiveTopic', secondRouteParameter);
        this.store.commit('setRouterTopic', secondRouteParameter);
      }
    }

    console.log('in hashChanged, firstRouteParameter:', firstRouteParameter, 'secondRouteParameter:', secondRouteParameter);

    let nextAddress;
    let nextTopic;
    if (this.topics.includes(firstRouteParameter)) {
      nextTopic = firstRouteParameter;
    } else {
      nextAddress = firstRouteParameter;
    }

    console.log('hashChanged is running, nextAddress:', nextAddress, 'nextTopic:', nextTopic);

    // let nextKeyword;
    // if (firstRouteParameter.includes('addr ')) {
    //   console.log('in hashChanged, includes addr')
    //   nextAddress = firstRouteParameter;
    //   this.store.commit('setSearchType', 'address');
    // } else if (firstRouteParameter.includes('kw ')) {
    //   console.log('in hashChanged, includes kw')
    //   nextKeyword = firstRouteParameter.replace('kw ', '');
    //   this.store.commit('setSearchType', 'keyword');
    // }


    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }

    if (nextAddress && nextAddress !== 'addr noaddress') {
      console.log('router hashChanged calling controller.handleSearchFormSubmit');
      // this.routeToAddress(nextAddress);
      if (firstRouteParameter.includes('shape')) {
        console.log("just added this, need ot coordinate this with resetShape, maybe take the new input from hash over the old in the state.\
        The mounted handleDrawnShape in app.vue might show a solution for this.");
        console.log("Maybe reset shape should happen here.");
        this.dataManager.resetData();
        this.controller.handleDrawnShape();
      } else {
        this.controller.handleSearchFormSubmit(nextAddress);
      }
    }

    if (nextTopic) {
      console.log('router.js if(nextTopic) is running, nextTopic:', nextTopic);
      this.dataManager.resetGeocode();
      this.store.commit('setActiveTopic', nextTopic);
      this.routeToTopic(nextTopic);
    }

    // if (nextKeyword) {
    //   // console.log('hashChanged sending keyWords to store, values:', values);
    //   this.routeToKeyword(nextKeyword);
    // }

    // if (this.store.state.activeTopic || this.store.state.activeTopic === "") {
    //   if (this.config.topics) {
    //     if (this.config.topics.length) {
    //       console.log('hashChanged is calling routeToTopic, secondRouteParameter:', secondRouteParameter);
    //       this.routeToTopic(secondRouteParameter);
    //     }
    //   }
    // }

    // if (this.store.state.selectedServices) {
    //   let secondRouteParameterArray;
    //   if (secondRouteParameter) {
    //     secondRouteParameterArray = secondRouteParameter.split(',');
    //   } else {
    //     secondRouteParameterArray = []
    //   }
    //   console.log('secondRouteParameterArray:', secondRouteParameterArray)
    //   this.store.commit('setSelectedServices', secondRouteParameterArray);
    // }
  }

  routeToAddress(nextAddress, searchCategory) {
    console.log('Router.routeToAddress, nextAddress:', nextAddress);
    if (nextAddress) {
      // check against current address
      const prevAddress = this.getAddressFromState();

      // if the hash address is different, geocode
      if (!prevAddress || nextAddress !== prevAddress) {
        // should this call the geocode client directly?
        this.dataManager.geocode(nextAddress, searchCategory);
      }

      return prevAddress;
    }
  }

  routeToOwner(nextOwner, searchCategory) {
    if (nextOwner) {
      // should this call the geocode client directly?
      this.dataManager.geocode(nextOwner, searchCategory);
    }
  }

  routeToZipcode(nextZipcode) {
    // console.log('routeToZipcode is running');
    this.store.commit('setSelectedZipcode', nextZipcode);
  }

  routeToKeyword(nextKeywords) {
    console.log('in pvd router.js routeToKeyword, nextKeywords:', nextKeywords);
    let values = nextKeywords.split(',');
    // console.log('in routeToKeyword values:', values);
    this.store.commit('setSelectedKeywords', values);

    // if (!this.silent) {
    //   nextKeywords = 'kw ' + nextKeywords

    //   // creating next hash
    //   const nextHash = this.makeHash(nextKeywords, this.store.state.selectedServices);

    //   const lastHistoryState = this.history.state;
    //   this.history.replaceState(lastHistoryState, null, nextHash);
    // }
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

  routeToMaintenance() {
    // console.log('routeToMaintenance is running');
  }

  routeToModal(selectedModal) {
    // console.log('routeToModal is running, selectedModal:', selectedModal);
    this.store.commit('setDidToggleModal', selectedModal);
  }

  // this gets called when you click a topic header.
  routeToTopic(nextTopic, address, target) {
    console.log('routeToTopic is running, nextTopic:', nextTopic, 'address:', address);
    // check against active topic
    const prevTopic = this.store.state.activeTopic;

    if (!prevTopic || prevTopic !== nextTopic) {
      this.store.commit('setActiveTopic', nextTopic);
      this.store.commit('setRouterTopic', nextTopic);
      this.store.commit('setActiveParcelLayer', this.activeParcelLayer());
    }

    if (!this.silent) {
      // let address = this.getAddressFromState();
      // address = 'addr ' + address;

      // let topics = [];
      // for (let topic of this.config.topics) {
      //   topics.push(topic.key);
      // }
      // console.log('router.js routeToTopic is running, topics:', topics, 'address:', address, 'nextTopic:', nextTopic, 'target:', target);

      if (address) {
        this.vueRouter.push({ name: 'address-and-topic', params: { address: address, topic: nextTopic }});
        // this.store.commit('setRouterTopic', nextTopic);
      } else if (this.topics.includes(nextTopic)) {
        this.vueRouter.push({ name: 'topic-only', params: { topic: nextTopic }});
        this.store.commit('setRouterTopic', nextTopic);
      }

      // const nextHash = this.makeHash(address, nextTopic);
      // const lastHistoryState = this.history.state;
      // this.history.replaceState(lastHistoryState, null, nextHash);
    }
  }

  // this is almost just the same thing as any of the routeTo... functions above
  // TODO this could have a name that is more declarative like "changeURL" (used to be called "didGeocode")

  setRouteByGeocode(testAddress) {

    console.log('setRouteByGeocode is starting wawa, this.store.state.bufferMode:', this.store.state.bufferMode, 'testAddress:', testAddress);
    if (this.store.state.activeTopic) {
      this.store.state.routerTopic = this.store.state.activeTopic;
    }

    let geocodeData;
    // if (this.store.state.geocode.data.properties.street_address) {
    if (testAddress) {
      geocodeData = {
        properties: {
          street_address: testAddress,
        },
      };
    } else {
      geocodeData = this.store.state.geocode.data;
    }
    // } else {
    //   geocodeData = this.store.state.parcels.pwd[0];//.properties.ADDRESS;
    // }


    // make hash if there is geocode data
    console.log('router setRouteByGeocode is running - geocodeData:', geocodeData);//, 'geocodeData.properties.street_address:', geocodeData.properties.street_address);
    if (geocodeData) {
      let address;

      if (geocodeData.street_address) {
        address = geocodeData.street_address;
      } else if (geocodeData.properties.street_address) {
        address = geocodeData.properties.street_address;
      } //else if (geocodeData.properties.ADDRESS) {
      //   address = geocodeData.properties.ADDRESS;
      // }


      // TODO - datafetch should not know topics are a thing
      // if (this.config.router.returnToDefaultTopicOnGeocode) {
      //   this.store.commit('setActiveTopic', this.config.defaultTopic);
      // }

      const topic = this.store.state.activeTopic;
      // console.log('setRouteByGeocode is running, address:', address, 'topic:', topic);
      // const selectedServices = this.store.state.selectedServices;

      // REVIEW this is only pushing state when routing is turned on. but maybe we
      // want this to happen all the time, right?
      
      if (!this.silent) {
        if (this.config.router.type === 'vue') {
          // console.log('in setRouteByGeocode, router type is vue, address:', address);
          // if (this.store.state.bufferMode) {
          //   this.vueRouter.push({ query: { ...this.vueRouter.query, ...{ 'buffer': address }}}).catch(()=>{});
          // } else if (this.config.router.pattern === 'address-and-topic') {
          if (this.config.router.pattern === 'address-and-topic') {
            console.log('this.vueRouter:', this.vueRouter);
            // let currentParams = this.vueRouter.history.current.params;
            let currentParams = this.vueRouter.currentRoute._value.params;
            console.log('setRouteByGeocode else if is running, currentParams:', currentParams, 'address:', address, 'topic:', topic);
            if (currentParams.address !== address || currentParams.topic !== topic) {
              if (!topic) {
                this.vueRouter.push({ name: 'address-only', params: { address: address }}).catch(()=>{});
              } else {
                // console.log('setRouteByGeocode else if is running, this.vueRouter:', this.vueRouter, 'currentParams:', currentParams);
                this.vueRouter.push({ name: 'address-and-topic', params: { address: address, topic: topic }}).catch(()=>{});
              }
            }
          } else {
            console.log('vueRouter push is being called with query');
            if (!this.store.state.bufferMode) {
              this.vueRouter.push({ query: { ...this.vueRouter.query, ...{ 'address': address }}}).catch(()=>{});
            }
          }
        } else {
          // console.log('in setRouteByGeocode, router type is not vue');
          const nextHistoryState = {
            geocode: geocodeData,
          };
          let nextHash;
          // address = 'addr ' + address;
          if (topic) {
            nextHash = this.makeHash(address, topic);
          } else {
            nextHash = this.makeHash(address, '');
          }
          // console.log('nextHistoryState', nextHistoryState, 'nextHash', nextHash);
          this.history.pushState(nextHistoryState, null, nextHash);
        }
      }
    } else {
      // wipe out hash if a geocode fails
      if (!this.silent) {
        this.history.pushState(null, null, '#');
      }
    }
  }

  setRouteByOpaNumber(value) {
    console.log('setRouteByOpaNumber is running');
    let p = value;
    this.vueRouter.push({ query: { p }}).catch(()=>{});
  }

  setRouteByBlockSearch(value) {
    const block = value;
    // console.log('router.js setRouteByBlockSearch is running, block:', block, 'value:', value);
    this.vueRouter.push({ query: { block }}).catch(()=>{});
  }

  setRouteByOwnerSearch() {
    console.log('router.js setRouteByOwnerSearch is running');
    const owner = this.store.state.geocode.input;
    this.vueRouter.push({ query: { owner }}).catch(()=>{});
  }

  setRouteByShapeSearch() {
    // console.log('router.js setRouteByShapeSearch is running');
    const shapeInput = this.store.state.shapeSearch.input;
    console.log('Router.didShapeSearch is running, shapeInput:', shapeInput);
    // only run this if the shape is in the store (which it will not be if it is created from the route)
    if (shapeInput) {
      let shape = '[[';
      var i;
      for (i=0; i < shapeInput.length - 1; i++) {
        shape += shapeInput[i][0].toFixed(5) + ',' + shapeInput[i][1].toFixed(5) + '],[';
        // shape += shapeInput[i].lat.toFixed(5) + ',' + shapeInput[i].lng.toFixed(5) + '],[';
      }
      // shape += ']]';
      shape += shapeInput[shapeInput.length - 1][0].toFixed(5) + ',' + shapeInput[shapeInput.length - 1][1].toFixed(5) + ']]';
      // shape += shapeInput[shapeInput.length - 1].lat.toFixed(5) + ',' + shapeInput[shapeInput.length - 1].lng.toFixed(5) + ']]';
      this.vueRouter.push({ query: { shape }}).catch(()=>{});
    }
  }

  setRouteByBufferSearch() {
    console.log('pvd router.js setRouteByBufferSearch is running');
    let geocodeData = this.store.state.geocode.data;
    let address;
    if (geocodeData.street_address) {
      address = geocodeData.street_address;
    } else if (geocodeData.properties.street_address) {
      address = geocodeData.properties.street_address;
    }
    this.vueRouter.push({ query: { ...this.vueRouter.query, ...{ 'buffer': address }}}).catch(()=>{});
  }
}

export default Router;
