

const initialState = {
  // this gets set to the parcel layer for the default (aka first) topic in
  // DataManager.resetGeocode, which is called by Router.hashChanged on app
  // load.
  activeTopic: '',
  routerTopic: '',
  activeParcelLayer: '',
  clickCoords: null,
  // should addresscandidate be here if neither pvm or pvc were included?
  shouldShowAddressCandidateList: false,
  // the ais feature
  geocode: {
    status: null,
    data: null,
    input: null,
    related: null,
  },
  ownerSearch: {
    status: null,
    data: null,
    input: null,
    total_size: null,
  },
  activeSearch: {
  },
  blockSearch: {
    status: null,
    data: null,
    input: null,
    total_size: null,
  },
  shapeSearch: {
    status: null,
    data: null,
    input: null,
  },
  condoUnits: {
    status: null,
    units: null,
  },
  searchType: 'address',
  lastSearchMethod: 'geocode',
  modals: {
    keys: [],
    open: '',
  },
  selectedServices: [],
  selectedKeywords: [],

};

const pvdStore = {
  createSources(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.dataSources || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val;
      // if the source has targets, just set it to be an empty object
      if (config.dataSources[key].targets) {
        val = {
          status: null,
          targets: {},
        };
      } else {
        val = {
          // we have to define these here, because vue can't observe properties that
          // are added later.
          status: null,
          secondaryStatus: null,
          data: null,
        };
      }

      o[key] = val;

      return o;
    }, {});
    return sources;
  },

  createPinSources(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.pinSources || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val;
      // if the source has targets, just set it to be an empty object
      if (config.pinSources[key].targets) {
        val = {
          targets: {},
        };
      } else {
        val = {
          // we have to define these here, because vue can't observe properties that
          // are added later.
          status: null,
          secondaryStatus: null,
          data: null,
        };
      }

      o[key] = val;

      return o;
    }, {});
    return sources;
  },
  createActivesearch(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.activeSearch || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val = {
        status: null,
        data: null,
      };
      o[key] = val;
      return o;
    }, {});
    return sources;
  },

  createParcels(config) {
    // console.log('createParcels is running, config:', config);
    const parcelKeys = Object.keys(config.parcels || {});
    const parcels = parcelKeys.reduce((o, key) => {
      let val;
      if (config.parcels[key].multipleAllowed && config.parcels[key].mapregStuff) {
        val = {
          data: [],
          status: null,
          activeParcel: null,
          activeAddress: null,
          activeMapreg: null,
        };
        // console.log('if mapregStuff section running, key:', key, 'val:', val);
      } else {
        // console.log('else mapregStuff section running, key:', key);
        val = null;
        // val = {
        //   geometry: null,
        //   id: null,
        //   properties: null,
        //   type: null
        // };
      }

      // console.log('o:', o, 'key:', key, 'val:', val, 'typeof val:', typeof val);
      o[key] = val;
      // console.log('o:', o, 'key:', key, 'val:', val);

      return o;
    }, {});
    // console.log('end of createParcels, parcels:', parcels);
    return parcels;
  },

  store: {
    state: initialState,
    mutations: {
      setSelectedServices(state, payload) {
        state.selectedServices = payload;
      },
      setSelectedKeywords(state, payload) {
        state.selectedKeywords = payload;
      },
      setSearchType(state, payload) {
        state.searchType = payload;
      },
      setActiveParcelLayer(state, payload) {
        state.activeParcelLayer = payload;
      },
      setRouterTopic(state, payload) {
        state.routerTopic = payload;
      },
      setActiveTopic(state, payload) {
        state.activeTopic = payload;
      },
      setClickCoords(state, payload) {
        state.clickCoords = payload;
      },
      setSourceStatus(state, payload) {
        // console.log('setSourceStatus is running, payload:', payload);
        const key = payload.key;
        const status = payload.status;

        // if a target id was passed in, set the status for that target
        const targetId = payload.targetId;

        if (targetId && state.sources[key].targets[targetId]) {
          // console.log('store.js setSourceStatus, key:', key, 'status:', status, 'targetId:', targetId);
          state.sources[key].targets[targetId].status = status;
        } else if (Object.keys(state.sources).includes(payload.key)) {
          state.sources[key].status = status;
        } else {
          state.pinSources[key].status = status;
        }
      },
      setSecondarySourceStatus(state, payload) {
        const key = payload.key;
        const secondaryStatus = payload.secondaryStatus;

        // if a target id was passed in, set the status for that target
        const targetId = payload.targetId;

        // if (targetId) {
        //   state.sources[key].targets[targetId].status = status;
        // } else {
        state.sources[key].secondaryStatus = secondaryStatus;
        // }
      },
      setSourceData(state, payload) {
        // console.log('store setSourceData is running, payload:', payload);
        const key = payload.key;
        const data = payload.data;

        // if a target id was passed in, set the data object for that target
        const targetId = payload.targetId;

        if (targetId) {
          if (state.sources[key].targets[targetId]) {
            state.sources[key].targets[targetId].data = data;
          }
        } else if (Object.keys(state.sources).includes(payload.key)) {
          state.sources[key].data = data;
        } else {
          state.pinSources[key].data = data;
        }
      },
      setSourceDataObject(state, payload) {
        // console.log('store setSourceDataObject is running, payload:', payload);
        const key = payload.key;
        const data = payload.data;
        state.sources[key].targets = data;
      },
      setSourceDataMore(state, payload) {
        // console.log('setSourceDataMore is running');
        const key = payload.key;
        const data = payload.data;
        const nextPage = payload.page;
        const oldData = state.sources[key].data;
        // console.log('oldData features', oldData.features, 'data features', data.features);
        const allData = oldData.features.concat(data.features);
        // console.log('allData', allData);
        // if a target id was passed in, set the data object for that target
        // const targetId = payload.targetId;

        // if (targetId) {
        //   state.sources[key].targets[targetId].data = data;
        // } else {

        state.sources[key].data.features = allData;
        state.sources[key].data.page = nextPage;
        // }
      },
      // this sets empty targets for a data source
      createEmptySourceTargets(state, payload) {
        // console.log('createEmptySourceTargets is running');
        const { key, targetIds } = payload;
        state.sources[key].targets = targetIds.reduce((acc, targetId) => {
          acc[targetId] = {
            status: null,
            data: null,
          };
          return acc;
        }, {});
      },
      clearSourceTargets(state, payload) {
        // console.log('clearSourceTargets is running, payload:', payload);
        const key = payload.key;
        state.sources[key].targets = {};
        if (state.sources[key].status) {
          state.sources[key].status = null;
        }
      },
      // this is the map center as an xy coordinate array (not latlng)
      setParcelData(state, payload) {
        // console.log('store setParcelData payload:', payload);
        const { parcelLayer, data, multipleAllowed, status, activeParcel, activeAddress, activeMapreg, mapregStuff } = payload || {};
        // console.log('store setParcelData mapregStuff:', mapregStuff, 'parcelLayer:', parcelLayer, 'data:', data, 'multipleAllowed:', multipleAllowed, 'status:', status, 'activeParcel:', activeParcel);
        if (!multipleAllowed || !mapregStuff) {
          // console.log('if');
          state.parcels[parcelLayer] = data;
        } else {
          // console.log('else');
          state.parcels[parcelLayer].data = data;
          state.parcels[parcelLayer].status = status;
          state.parcels[parcelLayer].activeParcel = activeParcel;
          state.parcels[parcelLayer].activeAddress = activeAddress;
          state.parcels[parcelLayer].activeMapreg = activeMapreg;
        }
      },
      setLastSearchMethod(state, payload) {
        state.lastSearchMethod = payload;
      },
      setGeocodeStatus(state, payload) {
        state.geocode.status = payload;
      },
      setGeocodeData(state, payload) {
        console.log('store.js setGeocodeData is running, payload:', payload);
        state.geocode.data = payload;
      },
      setGeocodeRelated(state, payload) {
        state.geocode.related = payload;
      },
      setGeocodeInput(state, payload) {
        state.geocode.input = payload;
      },
      setOwnerSearchStatus(state, payload) {
        state.ownerSearch.status = payload;
      },
      setOwnerSearchTotal(state, payload) {
        state.ownerSearch.total_size = payload;
      },
      setOwnerSearchData(state, payload) {
        state.ownerSearch.data = payload;
      },
      setOwnerSearchInput(state, payload) {
        state.ownerSearch.input = payload;
      },
      setShouldShowAddressCandidateList(state, payload) {
        state.shouldShowAddressCandidateList = payload;
      },
      setDidToggleModal(state, name) {
        state.modals.open = name;
      },

      setUnits(state, payload) {
        console.log('setUnits, payload:', payload);
        state.condoUnits.units = payload;
      },
      setCondoUnitsStatus(state, payload) {
        state.condoUnits.status = payload;
      },
      setActiveSearchStatus(state, payload) {
        let key = payload.activeSearchKey;
        state.activeSearch[payload.activeSearchKey].status = payload.status;
      },
      setActiveSearchData(state, payload) {
        const key = payload.activeSearchKey;
        const data = payload.data;
        state.activeSearch[key].data = data;
      },

      setBlockSearchStatus(state, payload) {
        //console.log('setShapeSearchStatus is running, payload:', payload);
        state.blockSearch.status = payload;
      },
      setBlockSearchInput(state, payload) {
        console.log('setBlockSearchInput is running, payload:', payload);
        state.blockSearch.input = payload;
      },
      setBlockSearchData(state, payload) {
        state.blockSearch.data = payload;
      },
      setBlockSearchTotal(state, payload) {
        state.blockSearch.total_size = payload;
      },
      setBlockSearchDataPush(state, payload) {
        console.log('store.js, setBlockSearchDataPush is running, payload:', payload);
        let objIndex = parseInt(payload.objIndex);
        delete payload.objIndex;
        state.blockSearch.data.splice(objIndex + 1, 0, ...payload);
      },
      setShapeSearchStatus(state, payload) {
        //console.log('setShapeSearchStatus is running, payload:', payload);
        state.shapeSearch.status = payload;
      },
      setShapeSearchInput(state, payload) {
        state.shapeSearch.input = payload;
      },
      setShapeSearchData(state, payload) {
        console.log('store.js, setShapeSearchData is running, payload:', payload);
        state.shapeSearch.data = payload;
      },
      setShapeSearchDataPush(state, payload) {
        console.log('store.js, setShapeSearchDataPush is running, payload:', payload);
        let objIndex = parseInt(payload.objIndex);
        delete payload.objIndex;
        state.shapeSearch.data.rows.splice(objIndex + 1, 0, ...payload);
      },
    },
  },
};

export default pvdStore;
