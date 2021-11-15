import axios from 'axios';
import httpsProxyAgent from 'https-proxy-agent';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class GeocodeClient extends BaseClient {

  evaluateDataForUnits(data) {
    // console.log('condo-search-client evaluateDataForUnit, data:', data);

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id ? a.properties.pwd_parcel_id : a.properties.dor_parcel_id);

    for (let item in groupedData){
      units.push.apply(units, groupedData[item]);
      // groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      // dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]));

    units.length > 0 ? units = _.groupBy(units, a => a.properties.pwd_parcel_id ? a.properties.pwd_parcel_id : a.properties.dor_parcel_id) : "";
    Object.keys(units).length > 1 ? delete units[""] : "";
    this.store.commit('setUnits', units);

    return data;
  }

  setFeatureProperties(feature, totalUnits, units) {
    console.log('geocode setFeatureProperties is running, feature:', feature, 'totalUnits:', totalUnits);
    // console.log('this.store.state.parcels.pwd[0].properties.ADDRESS:', this.store.state.parcels.pwd[0].properties.ADDRESS);

    feature.properties.opa_owners = [ "Condominium (" + totalUnits + " Units)" ];
    if (this.store.state.parcels.pwd) {
      feature.properties.street_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
      feature.properties.opa_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
      feature.properties.pwd_parcel_id = this.store.state.parcels.pwd[0].properties.PARCELID;
      feature._featureId = this.store.state.parcels.pwd[0].properties.PARCELID;
      feature.condo = true;
    } else {
      console.log('setFeatureProperties is still running', this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0]);
      let record = this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0];
      console.log("No pwd parcels, showing feature: ", record, record.properties);
      let address = record.properties.address_low + " " + record.properties.street_full;
      let parcelId = record.properties.dor_parcel_id;

      feature.properties.street_address = address;
      feature.properties.opa_address = address;
      // feature.properties.pwd_parcel_id = parcelId;
      feature.properties.dor_parcel_id = parcelId;
      feature._featureId = parcelId;
      feature.condo = true;
    }


    feature.condo = true;
    // console.log('setFeatureProperties is ending');

  }


  // fetch(input, category) {
  async fetch(input) {
    // console.log('geocode client fetch', input);//, 'this.store:', this.store);

    const store = this.store;
    let geocodeConfig;

    geocodeConfig = this.config.geocoder;
    const url = geocodeConfig.url(input);
    const agent = new httpsProxyAgent('http://proxy.phila.gov:8080');

    const params = geocodeConfig.params;
    if (params.page) {
      delete params['page'];
    }
    // const proxy = geocodeConfig.proxy;

    // console.log('url:', url, 'typeof url:', typeof url, 'params:', params);

    // update state
    this.store.commit('setGeocodeStatus', 'waiting');

    const success = this.success.bind(this);
    const error = this.error.bind(this);
    // const config = { params, proxy };
    // console.log('config:', config);

    // return a promise that can accept further chaining
    // return await axios.request({ url: url, httpsAgent: agent }, { params })
    return await axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    console.log('geocode success is running, response:', response, response.data.features[0].properties.opa_account_num);
    // this.dataManager.resetGeocodeOnly();
    const store = this.store;
    const data = response.data;
    const url = response.config.url;
    const totalUnits = data.total_size;

    // TODO handle multiple results

    if (!data.features || data.features.length < 1) {
      return;
    }

    let features = data.features;
    features = this.assignFeatureIds(features, 'geocode');

    // TODO do some checking here
    // console.log('geocode success, store.js feature:', feature, 'opa_account_num:', feature.properties.opa_account_num);
    let feature = features.filter(a => a.match_type === 'exact').length > 0 ? features.filter(a => a.match_type === 'exact')[0] :features[0];
    let relatedFeatures = [];

    // The slice is needed for reverse geocode bc there is a prototype object to remove
    // However, in PDE the exact match needs to be filtered to get the correct parcel and route
    // Example property: 1111 Herbert St.
    let featureGroup = features[0].match_type === 'exact_key' ? features.slice(1) : features;
    for (let relatedFeature of featureGroup){
      if (feature.properties.address_high && relatedFeature.match_type !== 'exact') {
        if (relatedFeature.properties.address_high) {
          relatedFeatures.push(relatedFeature);
        }
      } else if (relatedFeature.match_type !== 'exact') {
        relatedFeatures.push(relatedFeature);
      }
    }
    console.log('geocode success, relatedFeatures:', relatedFeatures);
    if (relatedFeatures.length > 0) {
      console.log('if relatedFeatures is running');
      // feature.condo = true;
      // this.store.commit('setUnits', {
      //   [feature.properties.pwd_parcel_id]: features,
      // });
      let params = response.config.params;

      async function getPages(features) {

        let pages = Math.ceil(data.total_size / 100);
        console.log('getPages is running still going 2, url:', url, 'data:', data, 'pages:', pages);

        if (pages > 1) {
          console.log('if pages > 1 is running');
          for (let counter = 2; counter<=pages; counter++) {
            console.log('in loop, counter:', counter, 'this:', this, 'params:', params);
            params.page = counter;
            console.log('right before axios, url:', url);
            let pageResponse = await axios.get(url, { params });
            features = await features.concat(pageResponse.data.features);
            // console.log('response:', pageResponse, 'features:', features)
          }
        }

        let units = features.filter(a => a.properties.unit_num != "");
        units = this.evaluateDataForUnits(units);

        var feature = JSON.parse(JSON.stringify(units[0]));
        for (let i in feature.properties) {
          feature.properties[i] = "";
        }

        if(this.store.state.parcels.pwd === null) {
          this.setFeatureProperties(feature, totalUnits, units);

          console.log('getPages if is running, feature:', feature);
          feature.condo = true;
          this.dataManager.resetGeocodeOnly();
          store.commit('setGeocodeData', feature);
          store.commit('setGeocodeStatus', 'success');
          // console.log('getPages else is still running 2');
          if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
            this.store.commit('setLastSearchMethod', 'geocode');
          }
          // console.log('feature:', feature);
        } else {
          // console.log('getPages else is running, feature:', feature);
          this.setFeatureProperties(feature, totalUnits);

          this.dataManager.resetGeocodeOnly();
          // console.log('getPages else is still running 1');
          store.commit('setGeocodeData', feature);
          store.commit('setGeocodeStatus', 'success');
          // console.log('getPages else is still running 2');
          if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
            this.store.commit('setLastSearchMethod', 'geocode');
          }
          // console.log('feature:', feature);
        }


        return feature;
        // }
      }

      let exactMatch = features.filter(a => a.match_type === 'exact');
      // console.log("exactMatch: ", exactMatch);
      getPages = getPages.bind(this);
      if (this.config.app && !exactMatch.length > 0 && this.config.app.title === 'Property Data Explorer') {
        return getPages(features);
      }


    }
    // console.log('geocode-client success, feature:', feature, 'opa_account_num:', feature.properties.opa_account_num, 'relatedFeatures:', relatedFeatures);
    // let creature = {
    //   type: feature.type,
    //   ais_feature_type: feature.ais_feature_type,
    //   match_type: feature.match_type,
    //   properties: feature.properties,
    //   geometry: feature.geometry,
    //   // _featureId: feature._featureId,
    // };

    // feature.condo = false;
    // feature['condo'] = false;

    console.log('geocode-client success 2, feature:', feature, feature.condo, 'relatedFeatures:', relatedFeatures);
    this.dataManager.resetGeocodeOnly();
    store.commit('setGeocodeData', feature);
    store.commit('setGeocodeRelated', relatedFeatures);
    store.commit('setGeocodeStatus', 'success');
    return feature;
  }

  error(error) {
    // console.log('geocode error is running, error:', error);
    const store = this.store;
    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default GeocodeClient;
