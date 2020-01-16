import axios from 'axios';
import httpsProxyAgent from 'https-proxy-agent';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class GeocodeClient extends BaseClient {

  evaluateDataForUnits(data) {
    // console.log('condo-search-client evaluateDataForUnit, data:', data);

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id);

    for (let item in groupedData){
      units.push.apply(units, groupedData[item]);
      // groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      // dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]));

    units.length > 0 ? units = _.groupBy(units, a => a.properties.pwd_parcel_id) : "";
    this.store.commit('setUnits', units);

    return data;
  }

  setFeatureProperties(feature, totalUnits) {
    // console.log('setFeatureProperties is running, feature:', feature, 'totalUnits:', totalUnits);
    // console.log('this.store.state.parcels.pwd[0].properties.ADDRESS:', this.store.state.parcels.pwd[0].properties.ADDRESS);

    feature.properties.opa_owners = [ "Condominium (" + totalUnits + " Units)" ];
    feature.properties.street_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
    // console.log('setFeatureProperties is still running');
    feature.properties.opa_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
    feature.properties.pwd_parcel_id = this.store.state.parcels.pwd[0].properties.PARCELID;
    feature._featureId = this.store.state.parcels.pwd[0].properties.PARCELID;
    feature.condo = true;
    // console.log('setFeatureProperties is ending');

  }


  // fetch(input, category) {
  async fetch(input) {
    console.log('geocode client fetch', input);//, 'this.store:', this.store);

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
    // console.log('geocode success is running');
    const store = this.store;
    const data = response.data;
    const url = response.config.url;

    // TODO handle multiple results

    if (!data.features || data.features.length < 1) {
      return;
    }

    let features = data.features;
    features = this.assignFeatureIds(features, 'geocode');

    // TODO do some checking here
    let feature = features[0];
    let relatedFeatures = [];
    for (let relatedFeature of features.slice(1)){
      if (feature.properties.address_high) {
        if (relatedFeature.properties.address_high) {
          relatedFeatures.push(relatedFeature);
        }
      } else {
        relatedFeatures.push(relatedFeature);
      }
    }
    if (relatedFeatures.length > 0) {
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
          // this.setFeatureProperties(feature, totalUnits);

          console.log('getPages if is running, feature:', feature);
          feature.condo = true;
          store.commit('setGeocodeData', feature);
          store.commit('setGeocodeStatus', 'success');
          // console.log('getPages else is still running 2');
          if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
            this.store.commit('setLastSearchMethod', 'geocode');
          }
          // console.log('feature:', feature);
        } else {
          console.log('getPages else is running, feature:', feature);
          this.setFeatureProperties(feature, totalUnits);

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

      getPages = getPages.bind(this);
      if (this.config.app && this.config.app.title === 'Property Data Explorer') {
        return getPages(features);
      }


    }
    // console.log('geocode-client, feature:', feature, 'relatedFeatures:', relatedFeatures);
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
