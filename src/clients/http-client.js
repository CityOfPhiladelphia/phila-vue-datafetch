import axios from 'axios';
import { format, subHours, addHours, subDays, addDays, subWeeks, addWeeks, subMonths, addMonths, subYears, addYears } from 'date-fns';
import BaseClient from './base-client';

class HttpClient extends BaseClient {

  fetchDataInSegments(feature, dataSource, dataSourceKey, targetIdFn, params) {
    console.log('http-client fetchDataInSegments, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);

    let featureArr = feature.split(',');
    // console.log("Here is the featureArr: ", featureArr, "length: ", featureArr.length)
    // Divide feature into groups of 200 so the url won't create an error

    let featuresObj = [];
    let featuresLength = featureArr.length,
      chunk = 200,
      subset;

    for (let i = 0; i < featuresLength; i += chunk) {
      subset = featureArr.slice(i, i + chunk);
      // output DIV with 12 items
      featuresObj.push(subset);
    }

    // console.log("subset: ", subset)
    // console.log("featuresObj: ", featuresObj)

    let data = [], targetId =[];
    let url = dataSource.url;
    const options = dataSource.options;
    const urlAddition = params.urlAddition;

    if (urlAddition) {
      url += encodeURIComponent(urlAddition);
      // url += encodeURIComponent(urlAddition.properties.street_address);
    }
    // console.log('url', url);
    const successFn = options.success;

    let responseResult = [];

    async function getDataBySegments() {
      const allFeaturesReturned = await featuresObj.map( async features => {
        // if the data is not dependent on other data

        let params = this.evaluateParams(features, dataSource);
        let featureResponse = await axios.get(url, { params });
        data = await data.concat(successFn(featureResponse.data));

        if (targetIdFn) {
          targetId = targetIdFn(feature);
          // console.log('in http-client, targetIdFn:', targetIdFn, 'feature:', feature, 'targetId:', targetId);
        }
      });

      let promisesFinished = await Promise.all(allFeaturesReturned);

      console.log('http-client is calling didFetchData');
      this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId, targetIdFn);
    }

    getDataBySegments = getDataBySegments.bind(this);

    // return getDataBySegments();
    let final = getDataBySegments();
    return final;
  }

  fetchPde(feature, dataSource, dataSourceKey, targetIdFn) {
    let params = this.evaluateParams(feature, dataSource);
    console.log('http-client fetchPde, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);

    let featureArr = feature.split(',');
    // console.log("Here is the featureArr: ", featureArr, "length: ", featureArr.length)


    if (featureArr.length < 210) {

      let url = dataSource.url;
      const options = dataSource.options;
      const urlAddition = params.urlAddition;
      if (urlAddition) {
        url += encodeURIComponent(urlAddition);
        // url += encodeURIComponent(urlAddition.properties.street_address);
      }
      // console.log('url', url);
      // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);
      // console.log('http-client fetch, feature:', feature);
      const successFn = options.success;
      // console.log("feature length: ", feature)

      if (params.urlAddition) {
        delete params['urlAddition'];
      }

      // if the data is not dependent on other data
      axios.get(url, { params }).then(response => {
        // call success fn
        let data = response.data;

        if (successFn) {
          data = successFn(data);
        }

        // get target id, if there should be one
        let targetId;
        if (targetIdFn) {
          targetId = targetIdFn(feature);
          // console.log('in http-client, targetIdFn:', targetIdFn, 'feature:', feature, 'targetId:', targetId);
        }

        // console.log('http-client.js is calling didFetchData')
        // console.log('in http-client, data:', data, 'targetId:', targetId);
        this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId, targetIdFn);
      }, response => {
        // console.log('fetch json error', response);
        this.dataManager.didFetchData(dataSourceKey, 'error');
      });

    } else {
      // console.log("The feature array is too long (current limit is 210)", this)
      this.fetchDataInSegments(feature, dataSource, dataSourceKey, targetIdFn, params);
    }
  }

  fetch(feature, dataSource, dataSourceKey, targetIdFn) {
    let params = this.evaluateParams(feature, dataSource);
    // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);
    let url = dataSource.url;
    const options = dataSource.options;
    const urlAddition = params.urlAddition;
    if (urlAddition) {
      url += encodeURIComponent(urlAddition);
      // url += encodeURIComponent(urlAddition.properties.street_address);
    }
    // console.log('http-client.js url', url, 'params:', params);
    // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);
    const successFn = options.success;

    if (params.urlAddition) {
      delete params['urlAddition'];
    }

    // if the data is not dependent on other data
    axios.get(url, { params }).then(response => {

      // console.log('in axios callback in http-client, this.store.state:', this.store.state);
      // axios.get('http://data.phila.gov/resource/w7rb-qrn8.json?parcel_number=012099800%27').then(response => {
      // call success fn
      let data = response.data;

      if (successFn) {
        data = successFn(data, this.store.state);
      }

      // get target id, if there should be one
      let targetId;
      if (targetIdFn) {
        targetId = targetIdFn(feature);
      }

      this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId);
    }, response => {
      console.log('fetch json error', response);
      this.dataManager.didFetchData(dataSourceKey, 'error');
    });
  }

  fetchMore(feature, dataSource, dataSourceKey, highestPageRetrieved) {
    // console.log('http-client.js fetchMore is running');
    let params = this.evaluateParams(feature, dataSource);
    params.page = highestPageRetrieved + 1;
    let url = dataSource.url;
    const options = dataSource.options;
    const urlAddition = params.urlAddition;
    if (urlAddition) {
      // url += encodeURIComponent(urlAddition.properties.street_address);
      url += encodeURIComponent(urlAddition);
    }
    const successFn = options.success;

    // if the data is not dependent on other data
    axios.get(url, { params }).then(response => {
      // call success fn
      let data = response.data;
      if (successFn) {
        data = successFn(data, this.store.state);
      }
      // console.log('data', data);
      this.dataManager.didFetchMoreData(dataSourceKey, 'success', data);
    }, response => {
      console.log('fetch json error', response);
      this.dataManager.didFetchMoreData(dataSourceKey, 'error');
    });
  }

  fetchNearby(feature, dataSource, dataSourceKey, targetIdFn) {
    const params = this.evaluateParams(feature, dataSource);
    const url = dataSource.url;
    const options = dataSource.options;
    // const srid = options.srid || 4326;
    const table = options.table;
    // TODO generalize these options into something like a `sql` param that
    // returns a sql statement
    const dateMinNum = options.dateMinNum || null;
    const dateMinType = options.dateMinType || null;
    // console.log('dateMinType:', dateMinType);
    const dateField = options.dateField || null;
    const successFn = options.success;
    const distances = options.distances || 250;
    // console.log('fetchNearby distances:', distances);

    const distQuery = "ST_Distance(the_geom::geography, ST_SetSRID(ST_Point("
                    + feature.geometry.coordinates[0]
                    + "," + feature.geometry.coordinates[1]
                    + "),4326)::geography)";

    const latQuery = "ST_Y(the_geom)";
    const lngQuery = "ST_X(the_geom)";

    // let select = '*'
    // if (calculateDistance) {
    const select = "*, " + distQuery + 'as distance,' + latQuery + 'as lat, ' + lngQuery + 'as lng';
    // }

    params['q'] = "select" + select + " from " + table + " where " + distQuery + " < " + distances;

    let subFn;
    if (dateMinNum) {
      // let subFn, addFn;
      switch (dateMinType) {
      case 'hour':
        subFn = subHours;
        break;
      case 'day':
        subFn = subDays;
        break;
      case 'week':
        subFn = subWeeks;
        break;
      case 'month':
        subFn = subMonths;
        break;
      case 'year':
        subFn = subYears;
        break;
      }

      // let test = format(subFn(new Date(), dateMinNum), 'YYYY-MM-DD');
      params['q'] = params['q'] + " and " + dateField + " > '" + format(subFn(new Date(), dateMinNum), 'yyyy-MM-dd') + "'";
    }

    // if the data is not dependent on other data
    axios.get(url, { params }).then(response => {
      // call success fn
      for (let row of response.data.rows) {
        row.distance = row.distance * 3.28084;
      }
      let data = response.data.rows;
      // console.log('table and data', table, data);

      if (successFn) {
        data = successFn(data);
      }

      // get target id, if there should be one
      let targetId;
      if (targetIdFn) {
        targetId = targetIdFn(feature);
      }

      this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId);
    }, response => {
      console.log('fetch json error', response);
      this.dataManager.didFetchData(dataSourceKey, 'error');
    });
  }
}

export default HttpClient;
