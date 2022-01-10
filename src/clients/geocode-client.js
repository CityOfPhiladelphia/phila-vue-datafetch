import axios from 'axios';
import httpsProxyAgent from 'https-proxy-agent';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class GeocodeClient extends BaseClient {

  evaluateDataForUnits(data) {

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id ? a.properties.pwd_parcel_id : a.properties.dor_parcel_id);
    console.log('geocode-client evaluateDataForUnit, data:', data, 'groupedData:', groupedData);


    for (let item in groupedData){
      units.push.apply(units, groupedData[item]);
      // groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      // dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]));

    units.length > 0 ? units = _.groupBy(units, a => a.properties.pwd_parcel_id ? a.properties.pwd_parcel_id : a.properties.dor_parcel_id) : "";
    let unitKeys = Object.keys(units);
    console.log('geocode-client.js about to call setUnits 1, units:', units, 'unitKeys:', unitKeys, 'unitKeys.length:', unitKeys.length);

    unitKeys.length > 1 ? delete units[""] : "";
    if (unitKeys[0] === '') {
      console.log('geocode-client.js in if, this.store.state:', this.store.state, "units['']:", units['']);
      // let idNumber = this.store.state.parcels.pwd ? Number(this.store.state.parcels.pwd[0].properties.PARCELID) : this.store.state.geocode.data.properties.dor_parcel_id;
      // Object.keys(units)[0] = idNumber;
      // units[''] = ;
      units = { 101: units[''] };
    }
    console.log('geocode-client.js about to call setUnits 2, units:', units, 'unitKeys:', unitKeys);
    this.store.commit('setUnits', units);

    return data;
  }

  setFeatureProperties(feature, totalUnits, units) {
    // console.log('this.store.state.parcels.pwd[0].properties.ADDRESS:', this.store.state.parcels.pwd[0].properties.ADDRESS);
    console.log('setFeatureProperties is running');

    feature.properties.opa_owners = [ "Condominium (" + totalUnits + " Units)" ];
    let record = this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0];

    console.log('geocode setFeatureProperties is running, feature:', feature, 'totalUnits:', totalUnits, 'record:', record);
    if (record.properties.pwd_parcel_id && this.store.state.parcels.pwd) {
      console.log('geocode setFeatureProperties, in if');
      feature.properties.street_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
      feature.properties.opa_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
      feature.properties.pwd_parcel_id = this.store.state.parcels.pwd[0].properties.PARCELID;
      feature._featureId = this.store.state.parcels.pwd[0].properties.PARCELID;
      feature.condo = true;
    } else if (record.properties.dor_parcel_id) {
      console.log('geocode setFeatureProperties in else if', this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0]);
      // let record = this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0];
      console.log("geocode setFeatureProperties in else if no pwd parcels, showing feature: ", record, record.properties);
      let address = record.properties.address_low + " " + record.properties.street_full;
      let parcelId = record.properties.dor_parcel_id;

      feature.properties.street_address = address;
      feature.properties.opa_address = address;
      // feature.properties.pwd_parcel_id = parcelId;
      feature.properties.dor_parcel_id = parcelId;
      feature._featureId = parcelId;
      feature.condo = true;
    } else {
      let address = record.properties.address_low + " " + record.properties.street_full;
      let parcelId = record.properties.dor_parcel_id;
      feature.properties.street_address = address;
      console.log('geocode setFeatureProperties wawa address:', address, 'feature.properties.street_address:', feature.properties.street_address, 'feature.properties:', feature.properties);
      feature.properties.opa_address = address;
      // feature.properties.pwd_parcel_id = parcelId;
      // feature.properties.dor_parcel_id = parcelId;
      // feature._featureId = parcelId;
      feature.condo = true;
      console.log('geocode setFeatureProperties in else, feature:', feature);
      return feature;
    }


    feature.condo = true;
    console.log('setFeatureProperties is ending, feature:', feature);
    // return feature;

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
    let status = 'waiting';
    console.log('geocode success is running, response:', response, response.data.features[0].properties.opa_account_num, 'about to call resetGeocodeOnly, status:', status);
    this.dataManager.resetGeocodeOnly(status);
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
    console.log('geocode success, feature:', feature, 'relatedFeatures:', relatedFeatures);
    if (relatedFeatures.length > 0) {
      console.log('geocode success if relatedFeatures is running');
      // feature.condo = true;
      // this.store.commit('setUnits', {
      //   [feature.properties.pwd_parcel_id]: features,
      // });
      let params = response.config.params;

      async function getPages(features) {

        let pages = Math.ceil(data.total_size / 100);
        console.log('geocode success getPages is running still going 2, url:', url, 'data:', data, 'pages:', pages);

        if (pages > 1) {
          console.log('geocode success if pages > 1 is running');
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

        let theFeature = JSON.parse(JSON.stringify(units[1]));
        // var feature = units[1];
        console.log('geocode success units:', units, 'theFeature:', theFeature, 'theFeature.properties.street_address:', theFeature.properties.street_address);
        for (let i in theFeature.properties) {
          theFeature.properties[i] = "";
        }

        if(this.store.state.parcels.pwd === null) {
          theFeature = this.setFeatureProperties(theFeature, totalUnits, units);

          console.log('getPages if is running, theFeature:', theFeature, 'this.store.state.parcels.pwd:', this.store.state.parcels.pwd);
          theFeature.condo = true;
          store.commit('setGeocodeData', theFeature);
          store.commit('setGeocodeStatus', 'success');
          // console.log('getPages else is still running 2');
          if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
            this.store.commit('setLastSearchMethod', 'geocode');
          }
          // console.log('feature:', feature);
        } else {
          console.log('getPages else is running, feature:', theFeature);
          this.setFeatureProperties(theFeature, totalUnits);

          // console.log('getPages else is still running 1');
          store.commit('setGeocodeData', theFeature);
          store.commit('setGeocodeStatus', 'success');
          // console.log('getPages else is still running 2');
          if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
            this.store.commit('setLastSearchMethod', 'geocode');
          }
          // console.log('feature:', feature);
        }


        return theFeature;
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
